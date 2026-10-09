import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from .analytics import to_dataframe

try:
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
    HAS_STATS = True
except Exception:
    HAS_STATS = False

def prepare_time_series(qs=None, df=None):
    if df is None:
        df = to_dataframe(qs)
    if df.empty:
        return pd.DataFrame()
    df = df.sort_values('month').copy()
    df['t'] = np.arange(len(df))
    # add month & year features for linear regression
    df['year'] = df['month'].dt.year
    df['month_num'] = df['month'].dt.month
    # sin/cos seasonality
    df['sin_m'] = np.sin(2 * np.pi * df['month_num'] / 12)
    df['cos_m'] = np.cos(2 * np.pi * df['month_num'] / 12)
    return df

def linear_regression_forecast(df, periods=12):
    """
    Returns forecast_df with columns month, predicted
    Also returns model and historical predictions for evaluation
    """
    if len(df) < 3:
        raise ValueError("Not enough data for forecasting (need at least 3 records).")
    df = prepare_time_series(df=df)
    X = df[['t', 'sin_m', 'cos_m']].values
    y = df['passengers'].values
    model = LinearRegression()
    model.fit(X, y)
    last_t = df['t'].max()
    last_month = df['month'].max()
    future_months = [last_month + pd.DateOffset(months=i) for i in range(1, periods+1)]
    future_t = np.arange(last_t+1, last_t+periods+1)
    future_month_nums = [d.month for d in future_months]
    future_sin = np.sin(2 * np.pi * np.array(future_month_nums) / 12)
    future_cos = np.cos(2 * np.pi * np.array(future_month_nums) / 12)
    X_future = np.column_stack([future_t, future_sin, future_cos])
    preds = model.predict(X_future)
    preds = np.maximum(preds, 0).astype(int)
    forecast_df = pd.DataFrame({'month': future_months, 'predicted': preds})
    # historical predictions for eval
    hist_pred = model.predict(X)
    return forecast_df, model, hist_pred

def moving_average_forecast(df, periods=12, window=12):
    if len(df) < 2:
        raise ValueError("Not enough data.")
    df = df.sort_values('month').copy()
    vals = df['passengers'].values
    # Simple moving average: use last window avg as constant forecast, then rolling window with predicted?
    # For baseline, use naive moving average extrapolation: iteratively forecast using window containing historical + prior forecasts
    history = list(vals)
    forecasts = []
    for i in range(periods):
        window_vals = history[-window:]
        avg = np.mean(window_vals)
        forecasts.append(int(max(avg, 0)))
        history.append(avg)
    last_month = df['month'].max()
    future_months = [last_month + pd.DateOffset(months=i) for i in range(1, periods+1)]
    forecast_df = pd.DataFrame({'month': future_months, 'predicted': forecasts})
    # For evaluation, compute rolling moving average on history for train set (shifted)
    # Use window moving average as predicted for each point (excluding first window-1)
    hist_pred = pd.Series(vals).rolling(window=window).mean().shift(1).bfill().values if len(vals) >= window else np.full(len(vals), np.mean(vals))
    # For metrics, align after window
    return forecast_df, None, hist_pred

def seasonal_forecast(df, periods=12):
    if not HAS_STATS:
        # Fallback to linear regression if statsmodels not available
        return linear_regression_forecast(df, periods)
    if len(df) < 24:
        # Not enough for seasonal - fallback to linear
        return linear_regression_forecast(df, periods)
    df = df.sort_values('month').copy()
    df = df.set_index('month')
    # Ensure monthly frequency
    df = df.asfreq('MS')
    # Interpolate missing if any
    df['passengers'] = df['passengers'].interpolate()
    try:
        model = ExponentialSmoothing(df['passengers'], trend='add', seasonal='add', seasonal_periods=12, initialization_method="estimated")
        fit = model.fit(optimized=True)
        preds = fit.forecast(periods)
        last_month = df.index.max()
        # fit.fittedvalues for evaluation
        hist_pred = fit.fittedvalues.reindex(df.index).fillna(df['passengers'].mean()).values
        forecast_df = pd.DataFrame({'month': preds.index, 'predicted': np.maximum(preds.values,0).astype(int)})
        return forecast_df, fit, hist_pred
    except Exception as e:
        # fallback
        df_reset = df.reset_index()
        return linear_regression_forecast(df_reset, periods)

def evaluate_model(y_true, y_pred):
    y_true = np.array(y_true)
    y_pred = np.array(y_pred)
    # Align lengths
    n = min(len(y_true), len(y_pred))
    y_true = y_true[:n]
    y_pred = y_pred[:n]
    # Remove NaNs
    mask = ~np.isnan(y_true) & ~np.isnan(y_pred)
    y_true = y_true[mask]
    y_pred = y_pred[mask]
    if len(y_true) == 0:
        return {'mae': 0, 'rmse': 0, 'mape': 0, 'r2': 0}
    mae = mean_absolute_error(y_true, y_pred)
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    # MAPE avoid division by zero
    mape_mask = y_true != 0
    if mape_mask.any():
        mape = np.mean(np.abs((y_true[mape_mask] - y_pred[mape_mask]) / y_true[mape_mask])) * 100
    else:
        mape = 0
    try:
        r2 = r2_score(y_true, y_pred)
    except:
        r2 = 0
    return {'mae': round(float(mae),2), 'rmse': round(float(rmse),2), 'mape': round(float(mape),2), 'r2': round(float(r2),4)}

def split_train_test(df, test_size=0.2):
    n = len(df)
    test_n = max(1, int(n * test_size))
    train = df.iloc[:-test_n].copy()
    test = df.iloc[-test_n:].copy()
    return train, test

def compare_models(qs=None, df=None):
    if df is None:
        df = to_dataframe(qs)
    if df.empty or len(df) < 12:
        return {}
    df = df.sort_values('month')
    train, test = split_train_test(df, test_size=0.2)
    results = {}
    # Linear regression trained on train, predicted on test
    try:
        # Need to prepare train for linear
        train_prep = prepare_time_series(df=train)
        test_prep = prepare_time_series(df=df)  # for mapping test months to features correctly
        # Actually fit on train only
        X_train = train_prep[['t','sin_m','cos_m']].values
        y_train = train_prep['passengers'].values
        model = LinearRegression()
        model.fit(X_train, y_train)
        # Predict test: need t continuing, sin/cos for test months
        last_t = train_prep['t'].max()
        test_t = np.arange(last_t+1, last_t+len(test)+1)
        test_sin = np.sin(2*np.pi*test['month'].dt.month/12)
        test_cos = np.cos(2*np.pi*test['month'].dt.month/12)
        X_test = np.column_stack([test_t, test_sin, test_cos])
        pred = model.predict(X_test)
        metrics = evaluate_model(test['passengers'].values, pred)
        results['linear'] = metrics
    except Exception as e:
        results['linear'] = {'mae': None, 'rmse': None, 'mape': None, 'r2': None, 'error': str(e)}

    # Moving average
    try:
        # Use window 12 or smaller if needed
        window = min(12, len(train))
        history = list(train['passengers'].values)
        preds = []
        for i in range(len(test)):
            window_vals = history[-window:]
            avg = np.mean(window_vals)
            preds.append(avg)
            history.append(test.iloc[i]['passengers'])  # for next step use actual? For eval we use rolling on test sequentially? Use actual train history + prior test actuals for one-step ahead
            # Actually for fair comparison, use actual previous test values after first prediction? We did. Could also use predicted.
        metrics = evaluate_model(test['passengers'].values, np.array(preds))
        results['moving_average'] = metrics
    except Exception as e:
        results['moving_average'] = {'mae': None, 'rmse': None, 'mape': None, 'r2': None, 'error': str(e)}

    # Seasonal / Exponential Smoothing
    try:
        if HAS_STATS and len(train) >= 24:
            train_sorted = train.sort_values('month').set_index('month').asfreq('MS')
            train_sorted['passengers'] = train_sorted['passengers'].interpolate()
            model = ExponentialSmoothing(train_sorted['passengers'], trend='add', seasonal='add', seasonal_periods=12, initialization_method="estimated")
            fit = model.fit(optimized=True)
            preds = fit.forecast(len(test))
            metrics = evaluate_model(test['passengers'].values, preds.values)
            results['seasonal'] = metrics
        else:
            # fallback linear on train
            results['seasonal'] = results.get('linear', {'mae': None})
    except Exception as e:
        results['seasonal'] = {'mae': None, 'rmse': None, 'mape': None, 'r2': None, 'error': str(e)}

    return results

def generate_forecast(qs=None, df=None, model_name='linear', periods=12, ma_window=12):
    if df is None:
        df = to_dataframe(qs)
    if df.empty:
        raise ValueError("No data available for forecasting.")
    df = df.sort_values('month')
    if model_name == 'linear':
        forecast_df, model, hist_pred = linear_regression_forecast(df, periods)
    elif model_name == 'moving_average':
        forecast_df, model, hist_pred = moving_average_forecast(df, periods, window=ma_window)
    elif model_name == 'seasonal':
        forecast_df, model, hist_pred = seasonal_forecast(df, periods)
    else:
        raise ValueError("Unknown model")
    # Evaluate on historical (in-sample) for display when not enough test split? Also compare
    metrics = evaluate_model(df['passengers'].values, hist_pred)
    # Also get comparison across models
    comparison = compare_models(df=df)
    return {
        'forecast': forecast_df,
        'hist_pred': hist_pred,
        'metrics': metrics,
        'comparison': comparison,
        'model': model,
    }

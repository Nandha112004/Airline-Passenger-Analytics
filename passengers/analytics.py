from django.db.models import Sum, Avg, Max, Min
from django.db.models.functions import ExtractYear, ExtractMonth
import pandas as pd
import numpy as np
from .models import PassengerData

def get_queryset():
    return PassengerData.objects.all().order_by('month')

def to_dataframe(qs=None):
    if qs is None:
        qs = get_queryset()
    data = list(qs.values('month', 'passengers'))
    if not data:
        return pd.DataFrame(columns=['month', 'passengers'])
    df = pd.DataFrame(data)
    df['month'] = pd.to_datetime(df['month'])
    df = df.sort_values('month')
    return df

def get_total_passengers(qs=None):
    if qs is None:
        qs = get_queryset()
    return qs.aggregate(total=Sum('passengers'))['total'] or 0

def get_average_passengers(qs=None):
    if qs is None:
        qs = get_queryset()
    return qs.aggregate(avg=Avg('passengers'))['avg'] or 0

def get_peak_month(qs=None):
    if qs is None:
        qs = get_queryset()
    return qs.order_by('-passengers').first()

def get_lowest_month(qs=None):
    if qs is None:
        qs = get_queryset()
    return qs.order_by('passengers').first()

def get_yearly_statistics(qs=None):
    if qs is None:
        qs = get_queryset()
    df = to_dataframe(qs)
    if df.empty:
        return []
    df['year'] = df['month'].dt.year
    df['month_num'] = df['month'].dt.month
    yearly = df.groupby('year').agg(
        total=('passengers', 'sum'),
        avg=('passengers', 'mean'),
        max=('passengers', 'max'),
        min=('passengers', 'min'),
        count=('passengers', 'count')
    ).reset_index()
    yearly = yearly.sort_values('year')
    # YoY growth
    yearly['yoy_growth'] = yearly['total'].pct_change() * 100
    # Highest/lowest month per year - we need month detail
    result = yearly.to_dict('records')
    for r in result:
        # Sanitize yoy_growth NaN -> None and convert numpy types to python
        if pd.isna(r.get('yoy_growth')):
            r['yoy_growth'] = None
        else:
            r['yoy_growth'] = round(float(r['yoy_growth']), 2)
        # Ensure year/total are python ints
        r['year'] = int(r['year'])
        r['total'] = int(r['total'])
        r['avg'] = round(float(r['avg']), 2)
        r['max'] = int(r['max'])
        r['min'] = int(r['min'])
        r['count'] = int(r['count'])
        year_df = df[df['year'] == r['year']]
        max_row = year_df.loc[year_df['passengers'].idxmax()]
        min_row = year_df.loc[year_df['passengers'].idxmin()]
        r['peak_month'] = max_row['month'].strftime('%Y-%m')
        r['peak_value'] = int(max_row['passengers'])
        r['low_month'] = min_row['month'].strftime('%Y-%m')
        r['low_value'] = int(min_row['passengers'])
    return result

def get_monthly_statistics(qs=None):
    if qs is None:
        qs = get_queryset()
    df = to_dataframe(qs)
    if df.empty:
        return []
    df['month_num'] = df['month'].dt.month
    monthly = df.groupby('month_num').agg(
        avg=('passengers', 'mean'),
        max=('passengers', 'max'),
        min=('passengers', 'min'),
        total=('passengers', 'sum'),
        count=('passengers', 'count')
    ).reset_index()
    overall_avg = df['passengers'].mean() if not df.empty else 0
    # seasonal index = monthly avg / overall avg * 100
    monthly['seasonal_index'] = (monthly['avg'] / overall_avg * 100) if overall_avg else 0
    month_names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    # but use full names for display
    full_names = ['January','February','March','April','May','June','July','August','September','October','November','December']
    result = []
    for _, row in monthly.iterrows():
        m = int(row['month_num'])
        result.append({
            'month_num': m,
            'month_name': full_names[m-1],
            'short_name': month_names[m-1],
            'avg': round(row['avg'], 2),
            'max': int(row['max']),
            'min': int(row['min']),
            'total': int(row['total']),
            'count': int(row['count']),
            'seasonal_index': round(row['seasonal_index'], 2),
        })
    # sort by month_num
    result = sorted(result, key=lambda x: x['month_num'])
    return result

def get_growth_statistics(qs=None):
    if qs is None:
        qs = get_queryset()
    df = to_dataframe(qs)
    if df.empty or len(df) < 2:
        return {
            'overall_growth': 0,
            'cagr': 0,
            'yoy': [],
            'mom': [],
            'mom_avg': 0,
        }
    df = df.sort_values('month')
    first = df.iloc[0]['passengers']
    last = df.iloc[-1]['passengers']
    overall = ((last - first) / first * 100) if first else 0

    # CAGR: (last/first)^(1/years) -1
    # years = (months difference) /12
    months = len(df)
    years = months / 12
    cagr = ((last / first) ** (1/years) - 1) * 100 if first and years else 0

    # MoM
    df['mom'] = df['passengers'].pct_change() * 100
    mom_avg = df['mom'].mean()

    # YoY - we need yearly totals
    yearly = get_yearly_statistics(qs)
    yoy = []
    for y in yearly:
        g = y.get('yoy_growth')
        if g is None or (isinstance(g, float) and pd.isna(g)):
            g = None
        yoy.append({'year': int(y['year']), 'growth': g})

    # last 12 MoM values - only json-serializable fields
    mom_df = df[['month','passengers','mom']].tail(12)
    mom_list = []
    for _, row in mom_df.iterrows():
        mom_val = row['mom']
        if pd.isna(mom_val):
            mom_val = None
        else:
            mom_val = round(float(mom_val), 2)
        mom_list.append({
            'month_str': pd.to_datetime(row['month']).strftime('%Y-%m'),
            'passengers': int(row['passengers']),
            'mom': mom_val
        })

    return {
        'overall_growth': round(overall, 2),
        'cagr': round(cagr, 2),
        'yoy': yoy,
        'mom': mom_list,
        'mom_avg': round(mom_avg, 2) if pd.notna(mom_avg) else 0,
    }

def get_seasonal_statistics(qs=None):
    monthly = get_monthly_statistics(qs)
    if not monthly:
        return {'monthly': [], 'insight': 'No data available.'}
    # Determine peak season insight dynamically
    sorted_by_avg = sorted(monthly, key=lambda x: x['avg'], reverse=True)
    top3 = sorted_by_avg[:3]
    bottom3 = sorted(monthly, key=lambda x: x['avg'])[:3]
    top_names = ', '.join([x['month_name'] for x in top3])
    bottom_names = ', '.join([x['month_name'] for x in bottom3])
    # Check if later months generally higher
    first_half = sum(x['avg'] for x in monthly[:6]) / 6
    second_half = sum(x['avg'] for x in monthly[6:]) / 6
    if second_half > first_half * 1.05:
        trend = "Passenger demand is generally higher during the middle and later months of the year (July–December), indicating a strong summer and holiday travel peak."
    elif first_half > second_half * 1.05:
        trend = "Passenger demand is generally higher during the earlier months of the year (January–June)."
    else:
        trend = "Passenger demand is relatively balanced across the year with moderate seasonal variation."
    insight = f"Peak travel months are {top_names}, while the lowest demand occurs in {bottom_names}. {trend}"
    return {'monthly': monthly, 'insight': insight}

def get_peak_low_year(qs=None):
    yearly = get_yearly_statistics(qs)
    if not yearly:
        return {'highest': None, 'lowest': None}
    highest = max(yearly, key=lambda x: x['total'])
    lowest = min(yearly, key=lambda x: x['total'])
    return {'highest': highest, 'lowest': lowest}

def get_heatmap_data(qs=None):
    if qs is None:
        qs = get_queryset()
    df = to_dataframe(qs)
    if df.empty:
        return {'years': [], 'months': [], 'data': []}
    df['year'] = df['month'].dt.year
    df['month_num'] = df['month'].dt.month
    years = sorted(df['year'].unique().tolist())
    months = list(range(1,13))
    # Build matrix year x month
    pivot = df.pivot(index='year', columns='month_num', values='passengers')
    # Ensure all months columns exist
    for m in months:
        if m not in pivot.columns:
            pivot[m] = np.nan
    pivot = pivot[months]  # order
    data = []
    for y in years:
        row = []
        for m in months:
            val = pivot.loc[y, m]
            if pd.isna(val):
                row.append(None)
            else:
                row.append(int(val))
        data.append(row)
    return {'years': years, 'months': months, 'data': data, 'min': int(df['passengers'].min()), 'max': int(df['passengers'].max())}

def get_dashboard_stats(qs=None):
    if qs is None:
        qs = get_queryset()
    total = get_total_passengers(qs)
    avg = get_average_passengers(qs)
    peak = get_peak_month(qs)
    low = get_lowest_month(qs)
    growth = get_growth_statistics(qs)
    # last year growth for card
    yearly = get_yearly_statistics(qs)
    last_yoy = None
    if yearly and len(yearly) >=2:
        last_yoy = yearly[-1]['yoy_growth']
        if last_yoy is not None and not pd.isna(last_yoy):
            last_yoy = round(last_yoy, 2)
        else:
            last_yoy = None
    return {
        'total': total,
        'avg': round(avg, 2) if avg else 0,
        'peak': peak,
        'low': low,
        'overall_growth': growth['overall_growth'],
        'cagr': growth['cagr'],
        'last_yoy': last_yoy,
        'count': qs.count(),
    }

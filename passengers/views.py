from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import JsonResponse, HttpResponse
from django.core.paginator import Paginator
from django.views.decorators.http import require_http_methods
import json
import csv
import pandas as pd
from .models import PassengerData
from .forms import PassengerDataForm, CSVUploadForm, CustomUserCreationForm, PassengerFilterForm, ForecastForm
from .analytics import (
    get_dashboard_stats, get_yearly_statistics, get_monthly_statistics,
    get_growth_statistics, get_seasonal_statistics, get_peak_low_year,
    get_heatmap_data, to_dataframe, get_queryset
)
from .forecasting import generate_forecast, compare_models
from .utils import validate_csv, import_csv, get_filtered_queryset

def home(request):
    if request.user.is_authenticated:
        return redirect('dashboard')
    # Public landing page. Read-only aggregate figures so the marketing copy
    # always reflects the real dataset instead of hard-coded placeholders.
    ctx = {'landing_stats': None, 'landing_series': []}
    try:
        qs = get_queryset()
        if qs.exists():
            stats = get_dashboard_stats(qs)
            monthly = get_monthly_statistics(qs)
            peak = stats.get('peak')
            low = stats.get('low')
            best = max(monthly, key=lambda m: m['avg']) if monthly else None
            ctx['landing_stats'] = {
                'total': int(stats.get('total', 0) or 0),
                'count': int(stats.get('count', 0) or 0),
                'overall_growth': stats.get('overall_growth', 0),
                'cagr': stats.get('cagr', 0),
                'peak_month': peak.month.strftime('%b %Y') if peak else '—',
                'peak_value': int(peak.passengers) if peak else 0,
                'low_month': low.month.strftime('%b %Y') if low else '—',
                'low_value': int(low.passengers) if low else 0,
                'seasonal_peak': best['short_name'] if best else '—',
                'has_data': True,
            }
            df = to_dataframe(qs).sort_values('month')
            series = [int(v) for v in df['passengers'].tolist()[-12:]]
            top = max(series) if series else 0
            ctx['landing_series'] = [
                {'h': max(6, round(p / top * 100)) if top else 6, 'v': p} for p in series
            ]
    except Exception:
        ctx['landing_stats'] = None
        ctx['landing_series'] = []
    return render(request, 'passengers/landing.html', ctx)

def register_view(request):
    if request.user.is_authenticated:
        return redirect('dashboard')
    if request.method == 'POST':
        form = CustomUserCreationForm(request.POST)
        if form.is_valid():
            user = form.save()
            login(request, user)
            messages.success(request, 'Account created successfully!')
            return redirect('dashboard')
        else:
            messages.error(request, 'Please correct the errors below.')
    else:
        form = CustomUserCreationForm()
    return render(request, 'registration/register.html', {'form': form})

@login_required
def dashboard(request):
    qs = get_queryset()
    stats = get_dashboard_stats(qs)
    yearly = get_yearly_statistics(qs)
    monthly = get_monthly_statistics(qs)
    growth = get_growth_statistics(qs)
    seasonal = get_seasonal_statistics(qs)
    # Try to generate a quick forecast for card (next month)
    forecast_next = None
    try:
        if qs.count() >= 6:
            from .forecasting import generate_forecast
            res = generate_forecast(qs=qs, model_name='linear', periods=1)
            forecast_next = int(res['forecast'].iloc[0]['predicted'])
    except:
        forecast_next = None
    # Prepare chart data for frontend
    df = to_dataframe(qs)
    if not df.empty:
        df['month_str'] = df['month'].dt.strftime('%Y-%m')
        trend_data = df[['month_str', 'passengers']].to_dict('records')
    else:
        trend_data = []
    yearly_chart = [{'year': y['year'], 'total': y['total']} for y in yearly]
    monthly_chart = monthly
    # Heatmap
    heatmap = get_heatmap_data(qs)
    context = {
        'stats': stats,
        'yearly': yearly,
        'monthly': monthly,
        'growth': growth,
        'seasonal': seasonal,
        'forecast_next': forecast_next,
        'trend_data_json': json.dumps(trend_data),
        'yearly_chart_json': json.dumps(yearly_chart),
        'monthly_chart_json': json.dumps(monthly_chart),
        'heatmap_json': json.dumps(heatmap),
    }
    return render(request, 'passengers/dashboard.html', context)

@login_required
def dashboard_api(request):
    qs = get_queryset()
    stats = get_dashboard_stats(qs)
    df = to_dataframe(qs)
    trend = []
    if not df.empty:
        df['month_str'] = df['month'].dt.strftime('%Y-%m')
        trend = df[['month_str', 'passengers']].to_dict('records')
    yearly = get_yearly_statistics(qs)
    monthly = get_monthly_statistics(qs)
    heatmap = get_heatmap_data(qs)
    # Convert peak/low to serializable
    peak = stats['peak']
    low = stats['low']
    stats_json = {
        'total': stats['total'],
        'avg': stats['avg'],
        'overall_growth': stats['overall_growth'],
        'cagr': stats['cagr'],
        'count': stats['count'],
        'peak': {'month': peak.month.strftime('%Y-%m'), 'passengers': peak.passengers} if peak else None,
        'low': {'month': low.month.strftime('%Y-%m'), 'passengers': low.passengers} if low else None,
    }
    return JsonResponse({
        'stats': stats_json,
        'trend': trend,
        'yearly': yearly,
        'monthly': monthly,
        'heatmap': heatmap,
    })

@login_required
def passenger_list(request):
    qs = get_filtered_queryset(request)
    # Growth per row calculation (MoM)
    # Need ordered by month ascending for growth calc, but we respect sort param for display?
    # For growth % column, compute based on chronological order
    all_ordered = PassengerData.objects.all().order_by('month')
    growth_map = {}
    prev = None
    for rec in all_ordered:
        if prev is not None and prev.passengers != 0:
            growth = (rec.passengers - prev.passengers) / prev.passengers * 100
            growth_map[rec.id] = round(growth, 2)
        else:
            growth_map[rec.id] = None
        prev = rec

    paginator = Paginator(qs, 12)
    page_number = request.GET.get('page')
    page_obj = paginator.get_page(page_number)

    filter_form = PassengerFilterForm(request.GET)

    # Years for filter dropdown
    years = PassengerData.objects.dates('month', 'year')
    years_list = sorted(set([d.year for d in PassengerData.objects.values_list('month', flat=True)]), reverse=True) if PassengerData.objects.exists() else []
    # Actually get years via python
    if PassengerData.objects.exists():
        years_list = sorted(set([m.year for m in PassengerData.objects.values_list('month', flat=True)]), reverse=True)
        # values_list returns dates? Let's just query distinct years via extraction
        from django.db.models.functions import ExtractYear
        years_list = sorted(PassengerData.objects.annotate(y=ExtractYear('month')).values_list('y', flat=True).distinct(), reverse=True)
    else:
        years_list = []

    context = {
        'page_obj': page_obj,
        'filter_form': filter_form,
        'growth_map': growth_map,
        'years_list': years_list,
        'query_params': request.GET.urlencode(),
    }
    return render(request, 'passengers/passenger_list.html', context)

@login_required
def passenger_add(request):
    if request.method == 'POST':
        form = PassengerDataForm(request.POST)
        if form.is_valid():
            form.save()
            messages.success(request, 'Passenger record added successfully!')
            return redirect('passenger_list')
        else:
            messages.error(request, 'Please correct the errors.')
    else:
        form = PassengerDataForm()
    return render(request, 'passengers/passenger_form.html', {'form': form, 'title': 'Add Passenger Data'})

@login_required
def passenger_edit(request, pk):
    obj = get_object_or_404(PassengerData, pk=pk)
    if request.method == 'POST':
        form = PassengerDataForm(request.POST, instance=obj)
        if form.is_valid():
            form.save()
            messages.success(request, 'Passenger record updated!')
            return redirect('passenger_list')
        else:
            messages.error(request, 'Please correct the errors.')
    else:
        form = PassengerDataForm(instance=obj)
    return render(request, 'passengers/passenger_form.html', {'form': form, 'title': 'Edit Passenger Data'})

@login_required
@require_http_methods(["GET", "POST"])
def passenger_delete(request, pk):
    obj = get_object_or_404(PassengerData, pk=pk)
    if request.method == 'POST':
        obj.delete()
        messages.success(request, 'Passenger record deleted!')
        return redirect('passenger_list')
    return render(request, 'passengers/passenger_confirm_delete.html', {'object': obj})

@login_required
def passenger_import(request):
    preview = None
    errors = None
    if request.method == 'POST':
        form = CSVUploadForm(request.POST, request.FILES)
        if form.is_valid():
            f = request.FILES['csv_file']
            # For preview first?
            if 'preview' in request.POST:
                preview_data, errs = validate_csv(f)
                preview = preview_data[:20]  # show 20 rows
                errors = errs
                # store file content in session for actual import? Simpler: require re-upload for import
                messages.info(request, f"Preview: {len(preview_data)} valid rows found. {len(errs)} errors.")
            elif 'import' in request.POST:
                result = import_csv(f, overwrite=False)
                if result['imported'] > 0:
                    messages.success(request, f"Imported {result['imported']} records. Skipped {result['skipped']} duplicates.")
                if result['errors']:
                    for e in result['errors'][:5]:
                        messages.error(request, e)
                if result['imported'] == 0 and result['skipped'] > 0:
                    messages.warning(request, f"All {result['skipped']} records were duplicates and skipped.")
                return redirect('passenger_list')
            else:
                # default import
                result = import_csv(f, overwrite=False)
                if result['imported'] > 0:
                    messages.success(request, f"Imported {result['imported']} records. Skipped {result['skipped']} duplicates.")
                if result['errors']:
                    for e in result['errors'][:5]:
                        messages.error(request, e)
                return redirect('passenger_list')
        else:
            messages.error(request, 'Invalid file.')
    else:
        form = CSVUploadForm()
    return render(request, 'passengers/import.html', {'form': form, 'preview': preview, 'errors': errors})

@login_required
def passenger_export(request):
    qs = get_filtered_queryset(request)
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="air_passengers_export.csv"'
    writer = csv.writer(response)
    writer.writerow(['Month', 'Passengers'])
    for obj in qs:
        writer.writerow([obj.month.strftime('%Y-%m'), obj.passengers])
    return response

@login_required
def trends_view(request):
    qs = get_queryset()
    if qs.count() == 0:
        messages.warning(request, 'No passenger data available. Please import data.')
    yearly = get_yearly_statistics(qs)
    monthly = get_monthly_statistics(qs)
    growth = get_growth_statistics(qs)
    seasonal = get_seasonal_statistics(qs)
    peak_low = get_peak_low_year(qs)
    df = to_dataframe(qs)
    trend_data = []
    if not df.empty:
        df['month_str'] = df['month'].dt.strftime('%Y-%m')
        trend_data = df[['month_str','passengers']].to_dict('records')
    context = {
        'yearly': yearly,
        'monthly': monthly,
        'growth': growth,
        'seasonal': seasonal,
        'peak_low': peak_low,
        'trend_data_json': json.dumps(trend_data),
        'yearly_json': json.dumps(yearly),
        'monthly_json': json.dumps(monthly),
        'growth_json': json.dumps(growth),
    }
    return render(request, 'passengers/trends.html', context)

@login_required
def trends_api(request):
    qs = get_queryset()
    yearly = get_yearly_statistics(qs)
    monthly = get_monthly_statistics(qs)
    growth = get_growth_statistics(qs)
    seasonal = get_seasonal_statistics(qs)
    return JsonResponse({'yearly': yearly, 'monthly': monthly, 'growth': growth, 'seasonal': seasonal})

@login_required
def forecast_view(request):
    qs = get_queryset()
    form = ForecastForm(request.GET or None)
    forecast_result = None
    chart_data = None
    initial_model = 'linear'
    initial_period = 12
    if form.is_valid():
        initial_model = form.cleaned_data['model']
        initial_period = form.cleaned_data['period']
        ma_window = form.cleaned_data.get('ma_window') or 12
    else:
        form = ForecastForm(initial={'model': initial_model, 'period': initial_period})

    # If POST generate
    if request.method == 'POST':
        form = ForecastForm(request.POST)
        if form.is_valid():
            model_name = form.cleaned_data['model']
            periods = form.cleaned_data['period']
            ma_window = form.cleaned_data.get('ma_window') or 12
            try:
                result = generate_forecast(qs=qs, model_name=model_name, periods=periods, ma_window=ma_window)
                forecast_df = result['forecast']
                # Prepare display table
                forecast_result = {
                    'table': [{'month': row['month'].strftime('%Y-%m'), 'predicted': int(row['predicted'])} for _, row in forecast_df.iterrows()],
                    'metrics': result['metrics'],
                    'comparison': result['comparison'],
                    'model': model_name,
                    'periods': periods,
                }
                # Chart data: historical + forecast
                df = to_dataframe(qs)
                hist = [{'month': m.strftime('%Y-%m'), 'passengers': int(p)} for m, p in zip(df['month'], df['passengers'])]
                fore = [{'month': row['month'].strftime('%Y-%m'), 'predicted': int(row['predicted'])} for _, row in forecast_df.iterrows()]
                chart_data = {'historical': hist, 'forecast': fore}
                messages.success(request, f'Forecast generated successfully using {model_name} for {periods} months.')
            except Exception as e:
                messages.error(request, f'Forecast error: {e}')
        else:
            messages.error(request, 'Invalid forecast parameters.')

    # For GET with no forecast yet, provide comparison if data exists
    comparison = None
    if qs.count() >= 12:
        try:
            comparison = compare_models(qs=qs)
        except:
            comparison = None

    # Also prepare historical chart for JS if no forecast
    df = to_dataframe(qs)
    hist_only = []
    if not df.empty:
        hist_only = [{'month': m.strftime('%Y-%m'), 'passengers': int(p)} for m, p in zip(df['month'], df['passengers'])]

    context = {
        'form': form,
        'forecast_result': forecast_result,
        'chart_data_json': json.dumps(chart_data) if chart_data else json.dumps({'historical': hist_only, 'forecast': []}),
        'comparison': comparison,
        'hist_only_json': json.dumps(hist_only),
    }
    return render(request, 'passengers/forecast.html', context)

@login_required
def forecast_api(request):
    qs = get_queryset()
    model_name = request.GET.get('model', 'linear')
    try:
        periods = int(request.GET.get('period', 12))
    except:
        periods = 12
    try:
        ma_window = int(request.GET.get('ma_window', 12))
    except:
        ma_window = 12
    try:
        result = generate_forecast(qs=qs, model_name=model_name, periods=periods, ma_window=ma_window)
        forecast_df = result['forecast']
        table = [{'month': row['month'].strftime('%Y-%m'), 'predicted': int(row['predicted'])} for _, row in forecast_df.iterrows()]
        df = to_dataframe(qs)
        hist = [{'month': m.strftime('%Y-%m'), 'passengers': int(p)} for m, p in zip(df['month'], df['passengers'])]
        fore = table
        return JsonResponse({
            'forecast': table,
            'historical': hist,
            'metrics': result['metrics'],
            'comparison': result['comparison'],
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)

@login_required
def visualizations(request):
    qs = get_queryset()
    df = to_dataframe(qs)
    yearly = get_yearly_statistics(qs)
    monthly = get_monthly_statistics(qs)
    heatmap = get_heatmap_data(qs)
    growth = get_growth_statistics(qs)
    # Prepare chart JSON
    trend_data = []
    if not df.empty:
        df['month_str'] = df['month'].dt.strftime('%Y-%m')
        trend_data = df[['month_str','passengers']].to_dict('records')
    # Forecast preview must come from the real model, never a client-side guess.
    preview = {'historical': [], 'forecast': [], 'model': None, 'metrics': None}
    if qs.count() >= 6:
        try:
            res = generate_forecast(qs=qs, model_name='linear', periods=12)
            fdf = res['forecast']
            preview['forecast'] = [
                {'month': str(r['month']), 'predicted': int(r['predicted'])}
                for _, r in fdf.iterrows()
            ]
            preview['historical'] = [
                {'month': d['month_str'], 'passengers': int(d['passengers'])}
                for d in trend_data
            ]
            preview['model'] = 'linear'
            preview['metrics'] = res.get('metrics')
        except Exception:
            preview = {'historical': [], 'forecast': [], 'model': None, 'metrics': None}
    context = {
        'trend_data_json': json.dumps(trend_data),
        'yearly_json': json.dumps(yearly),
        'monthly_json': json.dumps(monthly),
        'heatmap_json': json.dumps(heatmap),
        'growth_json': json.dumps(growth),
        'heatmap': heatmap,
        'forecast_preview': preview,
        'forecast_preview_json': json.dumps(preview),
    }
    return render(request, 'passengers/visualizations.html', context)

@login_required
def reports(request):
    qs = get_queryset()
    stats = get_dashboard_stats(qs)
    yearly = get_yearly_statistics(qs)
    monthly = get_monthly_statistics(qs)
    growth = get_growth_statistics(qs)
    seasonal = get_seasonal_statistics(qs)
    peak_low = get_peak_low_year(qs)
    # Forecast summary: try linear 12 months
    forecast_summary = None
    try:
        if qs.count() >= 6:
            res = generate_forecast(qs=qs, model_name='linear', periods=12)
            table = [{'month': row['month'].strftime('%Y-%m'), 'predicted': int(row['predicted'])} for _, row in res['forecast'].iterrows()]
            forecast_summary = {'table': table[:3], 'total_forecast': sum([x['predicted'] for x in table]), 'metrics': res['metrics']}
    except:
        forecast_summary = None

    # Determine peak/low objects
    peak = stats['peak']
    low = stats['low']

    context = {
        'stats': stats,
        'yearly': yearly,
        'monthly': monthly,
        'growth': growth,
        'seasonal': seasonal,
        'peak_low': peak_low,
        'forecast_summary': forecast_summary,
        'peak': peak,
        'low': low,
    }
    return render(request, 'passengers/reports.html', context)

@login_required
def settings_view(request):
    return render(request, 'passengers/settings.html')

@login_required
def profile_view(request):
    """Account overview built from the real authenticated user and dataset."""
    qs = get_queryset()
    df = to_dataframe(qs)
    earliest = None
    latest = None
    if not df.empty:
        earliest = df['month'].min()
        latest = df['month'].max()
    context = {
        'profile': request.user,
        'initial': (request.user.username[:1] or '?').upper(),
        'record_count': qs.count(),
        'month_span': (earliest, latest),
        'total_passengers': int(df['passengers'].sum()) if not df.empty else 0,
        'total_passengers_display': format(int(df['passengers'].sum()), ',') if not df.empty else '0',
        'last_login': request.user.last_login,
    }
    return render(request, 'passengers/profile.html', context)


def about_view(request):
    """Public About page. No login required, uses the public layout."""
    return render(request, 'passengers/about.html')

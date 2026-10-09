# Airline Passenger Trend Analysis and Demand Forecasting System

Professional analytics dashboard built with Django, Pandas, Scikit-learn, Statsmodels, and Chart.js. Manage historical passenger data, discover seasonal patterns, visualize trends, and forecast future demand.

## Features
- **Passenger Data Management**: CRUD, search, filters (year/month/range), sorting, pagination, growth% column, CSV import (drag-drop, preview, duplicate detection) & export
- **Dashboard**: Animated stat cards (total, avg, peak, low, growth, forecast), line/bar/seasonal/growth/heatmap charts (Chart.js), dark mode, responsive
- **Trend Analysis**: Monthly/yearly/seasonal stats, YoY/MoM/CAGR, peak/low demand, dynamically generated insights
- **Forecasting**: Linear Regression, Moving Average, Seasonal Exponential Smoothing (statsmodels), selectable horizon (3/6/12/24/36 months), forecast chart, MAE/RMSE/MAPE/R², model comparison (train/test split 20%, no shuffle)
- **Visualizations**: Line, bar, area, seasonal, heatmap (year×month), growth, forecast overlays
- **Reports**: Printable summary with dataset info, totals, growth, seasonal insight, forecast summary, CSV export
- **Auth**: Django auth (login/register/logout), @login_required, profile dropdown, admin site
- **UX**: Bootstrap 5, glassmorphism, soft gradients, rounded cards, hover lift, toast notifications, loading states, empty states, confirm modals, breadcrumbs

## Quick Start
### 1. Create virtual environment
```bash
python -m venv venv
```
### 2. Activate (Windows)
```bash
venv\Scripts\activate
```
Linux/Mac:
```bash
source venv/bin/activate
```
### 3. Install dependencies
```bash
pip install -r requirements.txt
```
### 4. Run migrations
```bash
python manage.py makemigrations
python manage.py migrate
```
### 5. Load dataset
```bash
python manage.py load_passenger_data
# options: --clear --overwrite --file data/air_passengers.csv
```
### 6. Create admin (optional)
```bash
python manage.py createsuperuser
```
### 7. Run server
```bash
python manage.py runserver
```
App: http://127.0.0.1:8000/
Admin: http://127.0.0.1:8000/admin/

## URLs
```
 /  -> landing (redirects to /dashboard/ if logged in)
 /dashboard/ , /dashboard/api/statistics/
 /passengers/ , /passengers/add/ , /passengers/edit/<id>/ , /passengers/delete/<id>/ , /passengers/import/ , /passengers/export/
 /trends/ , /trends/api/
 /forecast/ , /forecast/api/
 /visualizations/
 /reports/
 /login/ , /register/ , /logout/
 /settings/
 /admin/
```

## Dataset
`data/air_passengers.csv` — classic Air Passengers (1949-1960, 144 records):
```
Month,Passengers
1949-01,112
...
1960-12,432
```
CSV import validates columns, parses multiple date formats, checks duplicates, reports errors.

## Analytics & Forecasting
- `passengers/analytics.py`: total, avg, yearly/monthly/seasonal, growth (YoY/MoM/CAGR), heatmap, dashboard stats
- `passengers/forecasting.py`: `prepare_time_series`, `linear_regression_forecast` (t + sin/cos), `moving_average_forecast`, `seasonal_forecast` (ExponentialSmoothing), `evaluate_model` (MAE/RMSE/MAPE/R²), `compare_models`, `generate_forecast`

## Tests
```bash
python manage.py test
python manage.py check
```

## Project Structure (Cleaned)
```
Python_Project/                  <- Your Windows folder (container, NOT Django)
  venv/                          <- Virtual environment (already created)
  pythonproject/                 <- Django PROJECT ROOT (where manage.py lives) -> RUN HERE
    manage.py
    db.sqlite3                   <- SQLite DB (144 records)
    config/                      <- Django CONFIG (renamed from pythonproject/pythonproject to avoid duplicate)
      settings.py                <- ROOT_URLCONF='config.urls', WSGI='config.wsgi'
      urls.py
      wsgi.py / asgi.py
    passengers/                  <- Main app
      models.py, views.py, analytics.py, forecasting.py, utils.py, forms.py, admin.py
      management/commands/load_passenger_data.py
      templates/passengers/
    templates/                   <- Global templates
      base.html
      registration/login.html, register.html
    static/
    data/air_passengers.csv      <- Dataset
    requirements.txt, README.md, HOW_TO_RUN.md, CREDENTIALS.txt
```

**Why 2 folders before?** `Python_Project` is just your PC folder. `pythonproject` outer is Django root (has `manage.py`). Previous `pythonproject/pythonproject` was Django's default duplicate naming -> **fixed by renaming inner to `config`**. Now clean and professional.

## Color Scheme
Primary #2563EB, Secondary #0EA5E9, Accent #14B8A6, Background #F8FAFC, Dark #0F172A, Success #22C55E, Warning #F59E0B, Danger #EF4444

## License
Educational demo — adapt freely for portfolio/viva.

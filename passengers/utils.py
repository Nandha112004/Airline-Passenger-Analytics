import csv
import io
from datetime import datetime, date
from django.db import transaction
from .models import PassengerData

def parse_month(value):
    value = str(value).strip()
    formats = ['%Y-%m', '%Y-%m-%d', '%m/%Y', '%Y/%m', '%b %Y', '%B %Y', '%Y-%m-%d %H:%M:%S']
    for fmt in formats:
        try:
            dt = datetime.strptime(value, fmt)
            return date(dt.year, dt.month, 1)
        except:
            continue
    # Try pandas-like: 1949-01
    try:
        if '-' in value:
            parts = value.split('-')
            if len(parts) >=2:
                y = int(parts[0]); m = int(parts[1][:2])
                return date(y, m, 1)
    except:
        pass
    raise ValueError(f"Invalid month format: {value}")

def validate_csv(file_obj):
    try:
        content = file_obj.read().decode('utf-8')
    except:
        file_obj.seek(0)
        content = file_obj.read().decode('utf-8-sig')
    file_obj.seek(0)
    reader = csv.DictReader(io.StringIO(content))
    if reader.fieldnames is None:
        raise ValueError("CSV has no header row.")
    # Normalize fieldnames
    lower_fields = [f.strip().lower() for f in reader.fieldnames]
    if 'month' not in lower_fields or 'passengers' not in lower_fields:
        raise ValueError("CSV must contain 'Month' and 'Passengers' columns.")
    # Map to standard
    field_map = {f.strip().lower(): f for f in reader.fieldnames}
    month_key = field_map['month']
    pass_key = field_map['passengers']
    rows = list(reader)
    if not rows:
        raise ValueError("CSV is empty.")
    preview = []
    errors = []
    for i, row in enumerate(rows, start=2):
        try:
            m = parse_month(row[month_key])
            p_raw = str(row[pass_key]).strip().replace(',', '')
            p = int(float(p_raw))
            if p < 0:
                raise ValueError("Passengers must be >=0")
            preview.append({'month': m, 'passengers': p, 'raw_month': row[month_key], 'row': i})
        except Exception as e:
            errors.append(f"Row {i}: {e}")
            if len(errors) > 20:
                errors.append("... more errors truncated")
                break
    return preview, errors

def import_csv(file_obj, overwrite=False):
    preview, errors = validate_csv(file_obj)
    if errors and not preview:
        return {'imported': 0, 'skipped': 0, 'errors': errors, 'total': 0}
    imported = 0
    skipped = 0
    db_errors = []
    with transaction.atomic():
        for rec in preview:
            exists = PassengerData.objects.filter(month=rec['month']).exists()
            if exists:
                if overwrite:
                    PassengerData.objects.filter(month=rec['month']).update(passengers=rec['passengers'])
                    imported += 1
                else:
                    skipped += 1
            else:
                try:
                    PassengerData.objects.create(month=rec['month'], passengers=rec['passengers'])
                    imported += 1
                except Exception as e:
                    db_errors.append(str(e))
    all_errors = errors + db_errors
    return {'imported': imported, 'skipped': skipped, 'errors': all_errors, 'total': len(preview)}

def get_filtered_queryset(request, qs=None):
    if qs is None:
        qs = PassengerData.objects.all()
    year = request.GET.get('year')
    month = request.GET.get('month')
    min_p = request.GET.get('min_passengers')
    max_p = request.GET.get('max_passengers')
    search = request.GET.get('search')
    sort = request.GET.get('sort') or 'month'
    if year and year.isdigit():
        qs = qs.filter(month__year=int(year))
    if month and month.isdigit() and 1 <= int(month) <= 12:
        qs = qs.filter(month__month=int(month))
    if min_p and min_p.isdigit():
        qs = qs.filter(passengers__gte=int(min_p))
    if max_p and max_p.isdigit():
        qs = qs.filter(passengers__lte=int(max_p))
    if search:
        search = search.strip()
        # search by year, month name, or passenger
        # try to parse as int
        try:
            # if numeric, search passenger exact or year?
            if search.isdigit():
                val = int(search)
                # search passenger == val OR year == val OR month == val
                from django.db.models import Q
                qs = qs.filter(Q(passengers=val) | Q(month__year=val) | Q(month__month=val))
            else:
                # try month name?
                qs = qs.filter(month__icontains=search)
        except:
            pass
        # fallback: if search contains '-', try parse month string
        if '-' in search:
            try:
                dt = parse_month(search)
                qs = qs.filter(month=dt)
            except:
                pass
    allowed_sorts = ['month', '-month', 'passengers', '-passengers']
    if sort not in allowed_sorts:
        sort = 'month'
    qs = qs.order_by(sort)
    return qs

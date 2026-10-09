from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User
from .models import PassengerData
import datetime

class PassengerDataForm(forms.ModelForm):
    month = forms.DateField(
        widget=forms.DateInput(attrs={'type': 'month', 'class': 'form-control'}),
        input_formats=['%Y-%m', '%Y-%m-%d'],
        help_text='Select month (YYYY-MM)'
    )
    passengers = forms.IntegerField(
        widget=forms.NumberInput(attrs={'class': 'form-control', 'min': '0'}),
        min_value=0
    )

    class Meta:
        model = PassengerData
        fields = ['month', 'passengers']

    def clean_month(self):
        month = self.cleaned_data['month']
        # Normalize to first day of month
        if isinstance(month, str):
            pass
        month = datetime.date(month.year, month.month, 1)
        qs = PassengerData.objects.filter(month=month)
        if self.instance.pk:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise forms.ValidationError('A record for this month already exists.')
        return month

class CSVUploadForm(forms.Form):
    csv_file = forms.FileField(
        widget=forms.FileInput(attrs={'class': 'form-control', 'accept': '.csv'}),
        help_text='CSV with columns: Month, Passengers (e.g., 1949-01,112)'
    )

    def clean_csv_file(self):
        f = self.cleaned_data['csv_file']
        if not f.name.lower().endswith('.csv'):
            raise forms.ValidationError('File must be a CSV.')
        if f.size > 5 * 1024 * 1024:
            raise forms.ValidationError('File too large (max 5MB).')
        return f

class CustomUserCreationForm(UserCreationForm):
    email = forms.EmailField(required=True, widget=forms.EmailInput(attrs={'class': 'form-control', 'placeholder': 'Email'}))
    username = forms.CharField(widget=forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'Username'}))
    password1 = forms.CharField(widget=forms.PasswordInput(attrs={'class': 'form-control', 'placeholder': 'Password'}))
    password2 = forms.CharField(widget=forms.PasswordInput(attrs={'class': 'form-control', 'placeholder': 'Confirm Password'}))

    class Meta:
        model = User
        fields = ('username', 'email', 'password1', 'password2')

class PassengerFilterForm(forms.Form):
    year = forms.IntegerField(required=False, widget=forms.NumberInput(attrs={'class': 'form-control', 'placeholder': 'Year'}))
    month = forms.IntegerField(required=False, min_value=1, max_value=12, widget=forms.NumberInput(attrs={'class': 'form-control', 'placeholder': 'Month (1-12)'}))
    min_passengers = forms.IntegerField(required=False, min_value=0, widget=forms.NumberInput(attrs={'class': 'form-control', 'placeholder': 'Min passengers'}))
    max_passengers = forms.IntegerField(required=False, min_value=0, widget=forms.NumberInput(attrs={'class': 'form-control', 'placeholder': 'Max passengers'}))
    search = forms.CharField(required=False, widget=forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'Search year/month/passengers'}))
    sort = forms.ChoiceField(required=False, choices=[
        ('month', 'Date Asc'),
        ('-month', 'Date Desc'),
        ('passengers', 'Passengers Asc'),
        ('-passengers', 'Passengers Desc'),
    ], widget=forms.Select(attrs={'class': 'form-select'}))

class ForecastForm(forms.Form):
    MODEL_CHOICES = [
        ('linear', 'Linear Regression'),
        ('moving_average', 'Moving Average'),
        ('seasonal', 'Seasonal / Exponential Smoothing'),
    ]
    PERIOD_CHOICES = [
        (3, '3 months'),
        (6, '6 months'),
        (12, '12 months'),
        (24, '24 months'),
        (36, '36 months'),
    ]
    model = forms.ChoiceField(choices=MODEL_CHOICES, widget=forms.Select(attrs={'class': 'form-select'}))
    period = forms.TypedChoiceField(choices=PERIOD_CHOICES, coerce=int, widget=forms.Select(attrs={'class': 'form-select'}))
    ma_window = forms.IntegerField(required=False, min_value=2, max_value=24, initial=12, widget=forms.NumberInput(attrs={'class': 'form-control'}), help_text='Window for moving average (default 12)')

from django.urls import path
from . import views
from django.contrib.auth import views as auth_views

urlpatterns = [
    path('', views.home, name='home'),
    path('dashboard/', views.dashboard, name='dashboard'),
    path('dashboard/api/statistics/', views.dashboard_api, name='dashboard_api'),

    path('passengers/', views.passenger_list, name='passenger_list'),
    path('passengers/add/', views.passenger_add, name='passenger_add'),
    path('passengers/edit/<int:pk>/', views.passenger_edit, name='passenger_edit'),
    path('passengers/delete/<int:pk>/', views.passenger_delete, name='passenger_delete'),
    path('passengers/import/', views.passenger_import, name='passenger_import'),
    path('passengers/export/', views.passenger_export, name='passenger_export'),

    path('trends/', views.trends_view, name='trends'),
    path('trends/api/', views.trends_api, name='trends_api'),

    path('forecast/', views.forecast_view, name='forecast'),
    path('forecast/api/', views.forecast_api, name='forecast_api'),

    path('visualizations/', views.visualizations, name='visualizations'),
    path('reports/', views.reports, name='reports'),
    path('settings/', views.settings_view, name='settings'),
    path('profile/', views.profile_view, name='profile'),

    path('login/', auth_views.LoginView.as_view(template_name='registration/login.html'), name='login'),
    path('logout/', auth_views.LogoutView.as_view(next_page='login'), name='logout'),
    path('register/', views.register_view, name='register'),
    path('about/', views.about_view, name='about'),
]

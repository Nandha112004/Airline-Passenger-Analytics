from django.contrib import admin
from .models import PassengerData

@admin.register(PassengerData)
class PassengerDataAdmin(admin.ModelAdmin):
    list_display = ('month', 'passengers', 'created_at', 'updated_at')
    search_fields = ('month',)
    list_filter = ('month',)
    date_hierarchy = 'month'
    ordering = ('month',)
    list_per_page = 25

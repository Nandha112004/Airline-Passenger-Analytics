from django.db import models
from django.core.validators import MinValueValidator

class PassengerData(models.Model):
    month = models.DateField(unique=True, db_index=True, help_text="First day of month, e.g. 1949-01-01")
    passengers = models.PositiveIntegerField(validators=[MinValueValidator(0)], help_text="Number of passengers")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['month']
        verbose_name = 'Passenger Data'
        verbose_name_plural = 'Passenger Data'
        indexes = [
            models.Index(fields=['month']),
            models.Index(fields=['passengers']),
        ]

    def __str__(self):
        return f"{self.month.strftime('%Y-%m')} - {self.passengers}"

    @property
    def year(self):
        return self.month.year

    @property
    def month_name(self):
        return self.month.strftime('%B')

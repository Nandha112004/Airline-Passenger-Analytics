from django.core.management.base import BaseCommand
from pathlib import Path
from passengers.utils import import_csv

class Command(BaseCommand):
    help = 'Load passenger dataset from CSV'

    def add_arguments(self, parser):
        parser.add_argument('--file', type=str, default=str(Path(__file__).resolve().parents[3] / 'data' / 'air_passengers.csv'), help='Path to CSV file')
        parser.add_argument('--clear', action='store_true', help='Clear existing data before import')
        parser.add_argument('--overwrite', action='store_true', help='Overwrite duplicates')

    def handle(self, *args, **options):
        from passengers.models import PassengerData
        csv_path = Path(options['file'])
        self.stdout.write("Loading passenger dataset...")
        self.stdout.write(f"CSV: {csv_path}")
        if not csv_path.exists():
            # try alternative locations
            alt = Path.cwd() / 'data' / 'air_passengers.csv'
            if alt.exists():
                csv_path = alt
            else:
                self.stderr.write(self.style.ERROR(f"CSV not found: {csv_path}"))
                return
        if options['clear']:
            count = PassengerData.objects.count()
            PassengerData.objects.all().delete()
            self.stdout.write(f"Cleared {count} existing records.")

        before = PassengerData.objects.count()
        with open(csv_path, 'rb') as f:
            result = import_csv(f, overwrite=options['overwrite'])

        after = PassengerData.objects.count()
        total = result['total']
        imported = result['imported']
        skipped = result['skipped']
        errors = result['errors']

        self.stdout.write("")
        self.stdout.write(f"Records found: {total}")
        self.stdout.write(self.style.SUCCESS(f"Records imported: {imported}"))
        self.stdout.write(f"Duplicates skipped: {skipped}")
        self.stdout.write(f"Errors: {len(errors)}")
        for e in errors[:5]:
            self.stdout.write(self.style.WARNING(f"  - {e}"))
        if after > before or imported > 0:
            self.stdout.write(self.style.SUCCESS("\nDataset loaded successfully."))
        else:
            self.stdout.write("No new records imported (all duplicates?). Use --overwrite to update or --clear to reset.")

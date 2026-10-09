# HOW TO RUN - Airline Passenger Trend Analysis

**Everything is already set up (venv, packages, DB, dataset). Just run the server.**

---

## 1. Correct Folder Location

Your Django project is here (where `manage.py` lives):

```
E:\Python_Innovation_Project\Python_Project\pythonproject
```

**Do NOT run from `E:\Python_Innovation_Project\Python_Project` or `E:\Python_Innovation_Project`.**
Always `cd` into `pythonproject` (the one with `manage.py`) first.

Virtual environment is already at:

```
E:\Python_Innovation_Project\Python_Project\venv
```

---

## 2. Run Commands (Windows - CMD)

Copy-paste these **3 commands only**:

```bat
cd /d E:\Python_Innovation_Project\Python_Project\pythonproject

E:\Python_Innovation_Project\Python_Project\venv\Scripts\activate

python manage.py runserver
```

Or if you already activated venv:

```bat
cd /d E:\Python_Innovation_Project\Python_Project\pythonproject
python manage.py runserver
```

**PowerShell (if CMD fails):**

```powershell
cd E:\Python_Innovation_Project\Python_Project\pythonproject
E:\Python_Innovation_Project\Python_Project\venv\Scripts\Activate.ps1
python manage.py runserver
```

**Custom port (if 8000 busy):**

```bat
python manage.py runserver 8001
```

Wait for:

```
System check identified no issues (0 silenced).
Starting development server at http://127.0.0.1:8000/
```

Keep this terminal open. Do not close.

---

## 3. Open in Browser

- **Home:** http://127.0.0.1:8000/
- **Dashboard:** http://127.0.0.1:8000/dashboard/
- **Login:** http://127.0.0.1:8000/login/
- **Admin Panel:** http://127.0.0.1:8000/admin/

---

## 4. Login Credentials (Admin Ready)

```
Admin URL:  http://127.0.0.1:8000/admin/
App Login:  http://127.0.0.1:8000/login/
Username:   admin
Password:   admin123
Email:      admin@example.com
```

This superuser works for **both** App and Django Admin.

**Need your own user?** Go to http://127.0.0.1:8000/register/ -> Create account (no command needed).

**Reset password if needed:**

```bat
python manage.py changepassword admin
:: or
python manage.py shell -c "from django.contrib.auth.models import User; u=User.objects.get(username='admin'); u.set_password('admin123'); u.save()"
```

---

## 5. Clean Project Structure (Fixed)

**Before (confusing):**
```
Python_Project/                  <- Your Windows folder
  venv/                          <- Virtual environment
  pythonproject/                 <- Django ROOT (manage.py)
    pythonproject/               <- Django CONFIG (settings.py)  <-- DUPLICATE NAME = mess
```

**After (fixed - now clean):**

```
Python_Project/                          <- Your disk folder (NOT Django, just container)
  venv/                                  <- Python virtual environment (already created)
  pythonproject/                         <- Django PROJECT ROOT (run commands HERE)
    manage.py                            <- Entry point
    db.sqlite3                           <- Database (144 records already loaded)
    config/                              <- Django CONFIG (was pythonproject/pythonproject) *RENAMED to clean*
      settings.py
      urls.py
      wsgi.py
      asgi.py
    passengers/                          <- Main app
      models.py, views.py, analytics.py, forecasting.py, etc.
      templates/passengers/
    templates/                           <- Global templates (base.html, registration/)
    static/                              <- Static files
    data/
      air_passengers.csv                 <- Dataset
    requirements.txt
    HOW_TO_RUN.md                        <- This file
    CREDENTIALS.txt
    README.md
```

**Explanation:**
- `Python_Project` = folder you created on your PC to hold everything. Not a Django thing.
- `pythonproject` (outer) = Django project root. Contains `manage.py`. **This is where you run commands.**
- `config` (inner, previously `pythonproject/pythonproject`) = Django settings package. Renamed from duplicate to `config` to look professional and avoid confusion. Contains `settings.py`.

No more double `pythonproject/pythonproject`.

---

## 6. Stop Server

Press `CTRL + C` in the terminal where `runserver` is running.

To deactivate venv: `deactivate`

---

**That's it. Just `cd` to `pythonproject`, activate venv, `runserver`, login `admin/admin123`.**

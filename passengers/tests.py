from django.test import TestCase, Client
from django.contrib.auth.models import User
from django.urls import reverse
from .models import PassengerData
import datetime
import os

class PassengerModelTests(TestCase):
    def test_create_record(self):
        obj = PassengerData.objects.create(month=datetime.date(1949,1,1), passengers=112)
        self.assertEqual(str(obj), "1949-01 - 112")
        self.assertEqual(PassengerData.objects.count(), 1)

    def test_duplicate_month_validation(self):
        PassengerData.objects.create(month=datetime.date(1949,1,1), passengers=112)
        from django.db import IntegrityError
        with self.assertRaises(IntegrityError):
            PassengerData.objects.create(month=datetime.date(1949,1,1), passengers=118)

class ViewTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='testpass123', email='test@example.com')
        self.client = Client()
        PassengerData.objects.create(month=datetime.date(1949,1,1), passengers=112)
        PassengerData.objects.create(month=datetime.date(1949,2,1), passengers=118)
        PassengerData.objects.create(month=datetime.date(1960,12,1), passengers=432)

    def test_dashboard_redirect_if_not_logged_in(self):
        resp = self.client.get('/dashboard/')
        self.assertEqual(resp.status_code, 302)

    def test_dashboard_logged_in(self):
        self.client.login(username='testuser', password='testpass123')
        resp = self.client.get('/dashboard/')
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, 'Airline Analytics Overview')

    def test_passenger_crud(self):
        self.client.login(username='testuser', password='testpass123')
        # add
        resp = self.client.post('/passengers/add/', {'month': '1950-01', 'passengers': 115})
        self.assertIn(resp.status_code, [302, 200])
        # list
        resp = self.client.get('/passengers/')
        self.assertEqual(resp.status_code, 200)
        # edit
        obj = PassengerData.objects.get(month=datetime.date(1949,1,1))
        resp = self.client.post(f'/passengers/edit/{obj.id}/', {'month': '1949-01', 'passengers': 120})
        self.assertEqual(resp.status_code, 302)
        obj.refresh_from_db()
        self.assertEqual(obj.passengers, 120)
        # delete
        resp = self.client.post(f'/passengers/delete/{obj.id}/')
        self.assertEqual(resp.status_code, 302)
        self.assertFalse(PassengerData.objects.filter(id=obj.id).exists())

    def test_auth_register(self):
        resp = self.client.get('/register/')
        self.assertEqual(resp.status_code, 200)
        resp = self.client.post('/register/', {'username': 'newuser', 'email': 'new@example.com', 'password1': 'ComplexPass123!', 'password2': 'ComplexPass123!'})
        self.assertIn(resp.status_code, [302, 200])

class AnalyticsTests(TestCase):
    def setUp(self):
        for i in range(12):
            PassengerData.objects.create(month=datetime.date(1949, i+1, 1), passengers=100+i*10)
        for i in range(12):
            PassengerData.objects.create(month=datetime.date(1950, i+1, 1), passengers=200+i*10)

    def test_total_and_average(self):
        from .analytics import get_total_passengers, get_average_passengers, get_growth_statistics
        total = get_total_passengers()
        avg = get_average_passengers()
        self.assertGreater(total, 0)
        self.assertGreater(avg, 0)
        growth = get_growth_statistics()
        self.assertIn('overall_growth', growth)
        self.assertIn('cagr', growth)

    def test_yearly_monthly(self):
        from .analytics import get_yearly_statistics, get_monthly_statistics, get_seasonal_statistics
        yearly = get_yearly_statistics()
        self.assertGreater(len(yearly), 0)
        monthly = get_monthly_statistics()
        self.assertEqual(len(monthly), 12)
        seasonal = get_seasonal_statistics()
        self.assertIn('insight', seasonal)

class ForecastingTests(TestCase):
    def setUp(self):
        base = datetime.date(1949,1,1)
        for i in range(24):
            y = 1949 + (i // 12)
            m = (i % 12) + 1
            PassengerData.objects.create(month=datetime.date(y, m, 1), passengers=100 + i*5 + (m % 3)*10)

    def test_forecast_generation(self):
        from .analytics import to_dataframe
        from .forecasting import generate_forecast
        df = to_dataframe()
        res = generate_forecast(df=df, model_name='linear', periods=3)
        self.assertEqual(len(res['forecast']), 3)
        self.assertIn('mae', res['metrics'])
        # moving average
        res2 = generate_forecast(df=df, model_name='moving_average', periods=6, ma_window=3)
        self.assertEqual(len(res2['forecast']), 6)

    def test_model_evaluation(self):
        from .forecasting import evaluate_model
        metrics = evaluate_model([100,110,120], [101,109,121])
        self.assertIn('mae', metrics)
        self.assertIn('rmse', metrics)
        self.assertIn('r2', metrics)


class CustomizationIntegrationTests(TestCase):
    """Guards the second-pass redesign: real data only, assets wired, no dead nav links."""

    def setUp(self):
        self.user = User.objects.create_user(username='analyst', password='testpass123')
        self.client = Client()
        self.client.login(username='analyst', password='testpass123')
        for month in range(1, 9):
            PassengerData.objects.create(
                month=datetime.date(1960, month, 1), passengers=100 + month * 10
            )

    def test_profile_requires_login(self):
        self.client.logout()
        resp = self.client.get('/profile/')
        self.assertEqual(resp.status_code, 302)
        self.assertIn('/login/', resp['Location'])

    def test_profile_page_renders_real_account_data(self):
        resp = self.client.get('/profile/')
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, 'analyst')
        self.assertContains(resp, 'Date joined')
        # dataset contribution must reflect the real rows, not a placeholder
        self.assertContains(resp, '8')  # record count

    def test_visualizations_forecast_preview_is_real_model_output(self):
        import json
        resp = self.client.get('/visualizations/')
        self.assertEqual(resp.status_code, 200)
        html = resp.content.decode()
        start = html.find('"forecast": {')
        self.assertNotEqual(start, -1, 'forecast preview JSON island missing')
        blob = json.loads(html[start + len('"forecast": '):html.find('\n}', start)])
        self.assertEqual(blob['model'], 'linear')
        self.assertEqual(len(blob['forecast']), 12)
        self.assertTrue(all(isinstance(p['predicted'], int) for p in blob['forecast']))
        self.assertTrue(len(blob['historical']) == 8)
        # the fabricated client-side projection must be gone
        self.assertNotIn('12-Month Sample', html)
        self.assertNotIn('avgGrowth', html)

    def test_chart_and_appearance_assets_loaded(self):
        for url in ['/dashboard/', '/trends/', '/visualizations/', '/forecast/']:
            html = self.client.get(url).content.decode()
            self.assertIn('js/charts.js', html, url)
            self.assertIn('js/appearance.js', html, url)
            self.assertIn('js/settings-panel.js', html, url)
            self.assertIn('css/appearance.css', html, url)
            self.assertNotIn('new Chart(', html, url)

    def test_public_pages_load_appearance_assets(self):
        self.client.logout()
        for url in ['/', '/about/', '/login/']:
            html = self.client.get(url).content.decode()
            self.assertIn('js/appearance.js', html, url)
            self.assertIn('css/appearance.css', html, url)

    def test_login_page_has_password_toggle(self):
        self.client.logout()
        html = self.client.get('/login/').content.decode()
        self.assertIn('password-toggle', html)
        self.assertIn('id="id_password"', html)

    def test_no_undefined_token_in_chart_data_islands(self):
        import re
        for url in ['/dashboard/', '/trends/', '/visualizations/', '/forecast/']:
            html = self.client.get(url).content.decode()
            for island in re.findall(
                r'<script[^>]*type="application/json"[^>]*>(.*?)</script>', html, re.S
            ):
                for bad in ('NaN', 'Infinity', 'None'):
                    self.assertNotIn(bad, island, '%s leaked %s' % (url, bad))


class SidebarShellTests(TestCase):
    """The collapse/expand affordance must stay reachable and smooth."""

    def setUp(self):
        User.objects.create_user(username='shelluser', password='testpass123')
        self.client = Client()
        self.client.login(username='shelluser', password='testpass123')
        self.html = self.client.get('/dashboard/').content.decode()

    def test_sidebar_has_collapsible_structure(self):
        self.assertIn('id="sidebar"', self.html)
        self.assertIn('sidebarToggleBtn', self.html)
        self.assertIn('aria-expanded', self.html)
        # labels must be present so they can animate out
        self.assertIn('nav-text', self.html)
        self.assertIn('sidebar-cta', self.html)

    def test_only_one_collapse_control_exists(self):
        # a second control inside the 80px rail competed with the topbar
        # button and left stale aria state behind
        nav = self.sidebar()
        self.assertNotIn('sidebar-toggle', nav)
        self.assertNotIn('toggleCollapse()', nav)
        self.assertEqual(self.html.count('toggleCollapse()'), 1)

    def test_pro_analytics_cta_folds_away(self):
        # the card collapses its own height; no absolute-positioned
        # stand-in is needed, which is what made the rail look cluttered
        self.assertIn('sidebar-cta-wrap', self.html)
        self.assertIn('Pro Analytics', self.html)
        self.assertNotIn('sidebar-cta-mini', self.html)

    def test_every_nav_link_carries_a_tooltip(self):
        import re
        nav = self.sidebar()
        links = re.findall(r'<a class="nav-link[^"]*" href="([^"]+)"([^>]*)>', nav)
        self.assertGreaterEqual(len(links), 8)
        for href, rest in links:
            # native title: a CSS ::after tooltip is clipped by the
            # nav-link's own overflow:hidden and never becomes visible
            self.assertIn('title=', rest, '%s has no collapsed tooltip' % href)

    def test_dead_css_tooltip_system_is_not_reintroduced(self):
        import re
        nav = self.sidebar()
        css = open('static/css/core.css', encoding='utf-8').read()
        self.assertNotIn('data-tip', nav)
        self.assertNotIn('data-tip', css)
        self.assertNotIn('status-dot', nav)

    def test_sidebar_uses_a_single_nav_landmark(self):
        nav = self.sidebar()
        # a <nav> inside a <nav> breaks landmark navigation for screen readers
        self.assertEqual(nav.count('<nav'), 1)
        self.assertEqual(nav.count('</nav>'), 1)
        self.assertIn('aria-label="Main navigation"', nav)

    def test_no_inline_styling_left_in_sidebar(self):
        import re
        nav = self.sidebar()
        self.assertEqual(re.findall(r'style="', nav), [],
                         'sidebar styling belongs in core.css, not inline attributes')

    def test_sidebar_has_no_section_label_text(self):
        # the "Navigation" caption was removed; only the icon+label links remain
        self.assertNotIn('sidebar-subtitle', self.sidebar())
        self.assertNotIn('nav-section-label', self.sidebar())
        self.assertNotIn('>Navigation<', self.sidebar())

    def test_account_lives_only_in_the_topbar_not_the_sidebar_foot(self):
        html = self.client.get('/dashboard/').content.decode()
        nav = html[html.find('<nav id="sidebar"'):html.find('<div id="mainContent"')]
        # the duplicate bottom-left user block was removed
        self.assertNotIn('sidebar-foot', nav)
        self.assertNotIn('avatar-circle--lg', nav)
        self.assertNotIn('user-meta', nav)
        # ...and the account menu is still reachable, in the topbar
        self.assertIn('user-menu-btn', html)
        self.assertIn('shelluser', html)

    def test_account_menu_is_pinned_to_the_right_of_the_topbar(self):
        html = self.client.get('/dashboard/').content.decode()
        head = html[html.find('<header class="topnav'):html.find('</header>')]
        # ms-auto keeps the group hard against the right edge rather than
        # depending on justify-between spacing it out to the centre
        self.assertIn('ms-auto', head)
        self.assertIn('user-menu-btn', head)

    def test_css_has_no_rules_for_removed_elements(self):
        css = open('static/css/core.css', encoding='utf-8').read()
        for dead in ('.sidebar-foot', '.sidebar-subtitle', '.user-meta',
                     '.avatar-circle--lg', '.nav-section-label'):
            self.assertNotIn(dead, css, dead + ' is dead CSS after the cleanup')
        app = open('static/css/appearance.css', encoding='utf-8').read()
        self.assertNotIn('nav-section-label', app)

    def sidebar(self):
        html = self.client.get('/dashboard/').content.decode()
        return html[html.find('<nav id="sidebar"'):html.find('<div id="mainContent"')]

    def test_css_defines_transitions_not_display_toggles(self):
        css = open('static/css/core.css', encoding='utf-8').read()
        start = css.find('/* ---- collapsed state: one rule set')
        self.assertNotEqual(start, -1, 'collapsed-state marker is gone')
        collapsed = css[start:css.find('.sidebar .nav-link {')]
        # labels must fade out, not vanish, so the transition is visible
        self.assertIn('opacity: 0', collapsed)
        # the CTA collapses its own height rather than being display:none
        self.assertIn('max-height: 0', collapsed)
        # ...and the labels they belong to are the animated base state
        labels = css[css.find('.nav-text, .sidebar-title'):]
        labels = labels[:labels.find('}')]
        self.assertIn('opacity: 1', labels)
        self.assertIn('transition: opacity', labels)
        self.assertIn('--t-slow', labels)

    def test_collapsed_state_declares_no_competing_transitions(self):
        css = open('static/css/core.css', encoding='utf-8').read()
        # A second `.sidebar-cta` rule with its own `transition` silently
        # overrode the max-height/opacity transition, so the card snapped
        # open instead of folding away.
        start = css.find('/* ---- collapsed state: one rule set')
        collapsed = css[start:css.find('.sidebar .nav-link {')]
        self.assertIn('.sidebar-cta {', collapsed)
        self.assertNotIn('transition:', collapsed,
                         'collapsed-state block must not re-declare the transition')
        self.assertEqual(css.count('transition: max-height'), 1)
        self.assertEqual(css.count('overflow: hidden;\n  margin'), 0)

    def test_overlay_uses_opacity_not_display(self):
        css = open('static/css/core.css', encoding='utf-8').read()
        block = css[css.find('.overlay {'):]
        block = block[:block.find('}')]
        self.assertIn('opacity: 0', block)
        self.assertIn('visibility: hidden', block)
        self.assertNotIn('display: none', block)

    def test_mobile_collapse_never_applies(self):
        css = open('static/css/core.css', encoding='utf-8').read()
        mq = css[css.find('@media (max-width: 991px) {'):]
        # labels and the CTA are restored inside the mobile drawer
        self.assertIn('.sidebar.collapsed .nav-text', mq)
        self.assertIn('.sidebar.collapsed .sidebar-cta {', mq)
        self.assertIn('max-height: 260px', mq)

    def test_scroll_offset_accounts_for_sticky_topbar(self):
        css = open('static/css/core.css', encoding='utf-8').read()
        self.assertIn('scroll-behavior: smooth', css)
        self.assertIn('scroll-padding-top', css)

    def test_collapse_script_updates_aria_and_handles_escape(self):
        js = open('static/js/app.js', encoding='utf-8').read()
        self.assertIn('aria-expanded', js)
        self.assertIn('mqDesktop', js)
        self.assertIn("e.key !== 'Escape'", js)
        # the old instant classList-only implementation must be gone
        self.assertNotIn("classList.toggle('collapsed');", js)


class TemplateEncodingTests(TestCase):
    """trends.html was once saved through a cp1252 round-trip, which turned
    every em dash into 'aEUR"' and both emoji into 'a' + junk. The garbage sat
    directly between the year and the passenger count, so the numbers read as
    broken. These tests stop that coming back."""

    @classmethod
    def setUpTestData(cls):
        User.objects.create_user(username='encuser', password='testpass123')

    def setUp(self):
        self.client.login(username='encuser', password='testpass123')
    # bytes that only appear when UTF-8 has been decoded as cp1252/latin-1
    MOJIBAKE = set(
        '\u00e2\u20ac\u00a2\u00f0\u0178\u02c6\u2020\u201c\u201d\u2030'
        '\u0093\u0094\u009f\u0089\u008f\u201a\u201e\u0192\u0161\u0153'
        '\u017d\u017e\u0160\u0152\u2039\u203a'
    )
    ROOTS = ['templates', 'passengers/templates']
    EXT = {'.html', '.py', '.js', '.css'}

    def _files(self):
        import os
        for root in self.ROOTS:
            for dirpath, _, names in os.walk(root):
                for n in names:
                    if os.path.splitext(n)[1].lower() in self.EXT:
                        yield os.path.join(dirpath, n)

    def test_templates_are_valid_utf8_without_a_bom(self):
        import os
        for path in self._files():
            raw = open(path, 'rb').read()
            with self.subTest(path=path):
                self.assertFalse(raw.startswith(b'\xef\xbb\xbf'),
                                 '%s starts with a UTF-8 BOM' % path)
                try:
                    raw.decode('utf-8')
                except UnicodeDecodeError as e:
                    self.fail('%s is not valid UTF-8: %s' % (path, e))

    def test_no_mojibake_anywhere_in_templates(self):
        for path in self._files():
            text = open(path, 'rb').read().decode('utf-8')
            for i, line in enumerate(text.splitlines(), 1):
                hit = self.MOJIBAKE.intersection(line)
                with self.subTest(path=path, line=i):
                    self.assertEqual(
                        hit, set(),
                        '%s:%d has mojibake %r -- UTF-8 was decoded as cp1252'
                        % (path, i, ''.join(sorted(hit))))

    def test_no_c1_control_characters(self):
        for path in self._files():
            text = open(path, 'rb').read().decode('utf-8')
            for i, line in enumerate(text.splitlines(), 1):
                bad = [c for c in line if 0x80 <= ord(c) <= 0x9F]
                with self.subTest(path=path, line=i):
                    self.assertEqual(bad, [],
                                     '%s:%d has C1 control %r' % (path, i, bad))

    def test_trends_template_holds_the_recovered_characters(self):
        import os
        # asserted against the file, not the rendered page: the Peak & Low
        # card only renders when passenger data exists, so the trophy is
        # absent from the empty-state page by design.
        src = open(os.path.join('passengers', 'templates', 'passengers',
                                'trends.html'), 'rb').read().decode('utf-8')
        with self.subTest():
            self.assertIn('\U0001f4c8', src)   # the chart emoji came back
            self.assertIn('\U0001f3c6', src)   # the trophy came back
            self.assertIn('—', src)            # em dash, not aEUR"
            self.assertIn('•', src)            # bullet, not aEUR(c)
            self.assertEqual(self.MOJIBAKE.intersection(src), set())

    def test_rendered_pages_carry_no_mojibake(self):
        for url in ('/dashboard/', '/trends/', '/forecast/', '/visualizations/',
                    '/reports/', '/about/', '/passengers/'):
            html = self.client.get(url).content.decode('utf-8')
            with self.subTest(url=url):
                self.assertEqual(self.MOJIBAKE.intersection(html), set(),
                                 '%s rendered mojibake' % url)


class NumberFormattingTests(TestCase):
    """Numbers must be correct in the HTML itself, not only after JS runs."""

    def setUp(self):
        self.user = User.objects.create_user(username='fmtuser',
                                             password='fmtpass123')
        self.client = Client()
        self.client.login(username='fmtuser', password='fmtpass123')
        # 112 + 40291 = 40403 -> exercises a thousands separator
        PassengerData.objects.create(month=datetime.date(1949, 1, 1),
                                     passengers=112)
        PassengerData.objects.create(month=datetime.date(1949, 2, 1),
                                     passengers=40291)

    def test_thousands_filter_uses_plain_ascii_commas(self):
        from .templatetags.formatting import thousands
        self.assertEqual(thousands(40303), '40,303')
        self.assertEqual(thousands(144), '144')
        self.assertEqual(thousands(999), '999')
        self.assertEqual(thousands(1000), '1,000')
        self.assertEqual(thousands(1234567), '1,234,567')
        self.assertEqual(thousands(279.88, 0), '280')
        self.assertEqual(thousands(1234.5, 1), '1,234.5')
        self.assertEqual(thousands(-40303), '-40,303')
        for value in (40303, 1234567, 1234.5, 0, 999999999):
            out = thousands(value)
            with self.subTest(value=value):
                self.assertNotIn('\u00a0', out)
                self.assertNotIn('\u202f', out)
                self.assertNotIn('\u2009', out)

    def test_thousands_filter_passes_through_bad_input(self):
        from .templatetags.formatting import thousands
        for value in (None, '', 'abc', [1, 2]):
            with self.subTest(value=value):
                self.assertEqual(thousands(value), value)

    def test_counters_render_real_values_without_javascript(self):
        import re
        html = self.client.get('/dashboard/').content.decode('utf-8')
        # every animated counter must carry its real number as text, not "0"
        for target, expected in (('40403', '40,403'), ('40291', '40,291')):
            with self.subTest(target=target):
                match = re.search(
                    r'data-count="%s"[^>]*>([^<]*)<' % target, html)
                self.assertIsNotNone(match,
                                     'no counter found for %s' % target)
                self.assertEqual(match.group(1).strip(), expected)
        self.assertNotIn('data-count="40403" >0<', html.replace(' ', ''))

    def test_trends_yearly_table_uses_separators(self):
        import re
        html = self.client.get('/trends/').content.decode('utf-8')
        self.assertRegex(html, r'<td>40,403</td>')
        self.assertNotIn('<td>40403</td>', html)


class CountReplayTests(TestCase):
    """Clicking a stat card must re-roll its counter, every time."""

    def setUp(self):
        self.user = User.objects.create_user(username='replayuser',
                                             password='replaypass123')
        self.client = Client()
        self.client.login(username='replayuser', password='replaypass123')
        PassengerData.objects.create(month=datetime.date(1949, 1, 1),
                                     passengers=112)
        PassengerData.objects.create(month=datetime.date(1949, 2, 1),
                                     passengers=40291)
        with open(os.path.join('static', 'js', 'app.js'), encoding='utf-8') as f:
            self.js = f.read()
        with open(os.path.join('static', 'css', 'components.css'),
                  encoding='utf-8') as f:
            self.css = f.read()

    def test_replay_api_exists_and_is_wired_into_boot(self):
        self.assertIn('AA.replayCount =', self.js)
        self.assertIn('AA.initCountReplay =', self.js)
        self.assertRegex(self.js, r'function initAll\(root\)\s*\{[^}]*'
                                 r'AA\.initCountReplay\(root\)')

    def test_observer_only_marks_once_so_replay_is_needed(self):
        # the scroll observer deliberately fires once; the click path is the
        # only way a card counts again, so both must exist.
        self.assertIn('data-counted', self.js)
        self.assertIn('AA.replayCount(counter)', self.js)

    def test_rapid_clicks_cancel_the_previous_frame(self):
        # without cancelAnimationFrame two rAF loops fight and the number
        # can settle on the wrong value
        self.assertIn('cancelAnimationFrame(el._aaFrame)', self.js)

    def test_nested_controls_are_not_hijacked(self):
        # a card containing a link must still navigate normally
        self.assertIn("const CONTROL = 'a, button, input, select, textarea'",
                      self.js)
        self.assertRegex(self.js,
                         r"addEventListener\('click'[\s\S]{0,220}?closest\(CONTROL\)")

    def test_cards_are_marked_replayable_and_keyboard_reachable(self):
        self.assertIn("card.classList.add('is-replayable')", self.js)
        self.assertIn("card.setAttribute('role', 'button')", self.js)
        self.assertIn("card.setAttribute('tabindex', '0')", self.js)

    def test_css_affordance_and_reduced_motion_guard(self):
        self.assertRegex(self.css, r'\.stat-card\.is-replayable\s*\{[^}]*'
                                   r'cursor:\s*pointer')
        self.assertRegex(self.css, r'\.count-up\.is-rolling\s*\{[^}]*'
                                   r'animation:\s*countRoll')
        self.assertIn('@keyframes countRoll', self.css)
        self.assertRegex(self.css, r'prefers-reduced-motion:\s*reduce'
                                   r'[\s\S]{0,160}?\.count-up\.is-rolling'
                                   r'\s*\{[^}]*animation:\s*none')

    def test_dashboard_stat_cards_carry_counters(self):
        html = self.client.get('/dashboard/').content.decode('utf-8')
        parts = html.split('class="card-modern')
        cards = [p for p in parts if 'stat-card' in p.split('>', 1)[0]]
        self.assertGreaterEqual(len(cards), 5)
        replayable = [c for c in cards if 'data-count' in c]
        self.assertGreaterEqual(len(replayable), 5)




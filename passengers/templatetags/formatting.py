from django import template

register = template.Library()

NBSP = '\u00a0'
NARROW_NBSP = '\u202f'


@register.filter(name='thousands')
def thousands(value, decimals=0):
    """Format a number with plain ASCII comma thousands separators.

    Deliberately avoids Django's ``intcomma``/localised formatting, which can
    emit locale-specific group separators (U+00A0, U+202F thin spaces) that
    render as unreadable boxes in some fonts.  The animated counters in
    ``app.js`` format with ``toLocaleString('en-US')``, so the server-rendered
    fallback text produced here matches the animated output exactly.
    """
    try:
        number = float(value)
    except (TypeError, ValueError):
        return value

    try:
        places = max(0, int(decimals))
    except (TypeError, ValueError):
        places = 0

    if number != number or number in (float('inf'), float('-inf')):
        return value

    text = '{:,.{}f}'.format(number, places)
    # Guard against any separator that is not a plain ASCII comma.
    return text.replace(NARROW_NBSP, ',').replace(NBSP, ',')

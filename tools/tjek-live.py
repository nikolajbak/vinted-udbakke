# Koerer telefonen det, der staar i git?
#
# Runnerne er det farligste sted i projektet: de lever inde i en String.raw-tekst,
# og en udgivelse, der halvvejs lykkedes, ser ud som ingenting herfra. Derfor
# hentes den udleverede tekst ned og sammenlignes tegn for tegn med kilden.
import io, os, re, sys, urllib.request

RUNNERE = ["vinted-fill-script", "dba-fill-script"]


def lokal(slug):
    kilde = io.open("supabase/functions/%s/runner.ts" % slug, encoding="utf-8").read()
    m = re.search(r"String\.raw`([\s\S]*)`;\s*$", kilde)
    return m.group(1) if m else None


def udleveret(slug):
    base = os.environ["SUPABASE_URL"].rstrip("/")
    url = "%s/functions/v1/%s?key=%s&script=1" % (base, slug, os.environ["SHORTCUT_KEY"])
    with urllib.request.urlopen(url, timeout=30) as r:
        return r.read().decode("utf-8")


fejl = 0
for slug in (sys.argv[1:] or RUNNERE):
    if slug not in RUNNERE:
        continue
    try:
        a, b = lokal(slug), udleveret(slug)
    except Exception as e:
        print("  %-20s kunne ikke tjekkes: %s" % (slug, e))
        fejl += 1
        continue
    if a is None:
        print("  %-20s fandt ingen RUNNER-tekst i kilden" % slug)
        fejl += 1
    elif a == b:
        print("  %-20s live = git (%d tegn)" % (slug, len(a)))
    else:
        print("  %-20s LIVE AFVIGER FRA GIT (git %d tegn, live %d)" % (slug, len(a), len(b)))
        fejl += 1
sys.exit(1 if fejl else 0)

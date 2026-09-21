# Skriver en udgivelse ind i UDGIVELSER.md.
#
# Noten skal kunne staa alene: naar noget braender en tirsdag aften, skal man
# kunne laese EN blok og vide, hvad der er live, hvilket commit det kom fra, og
# hvad man skal skrive for at komme tilbage. Derfor skrives versionsnumrene af
# fra Supabase EFTER udrulningen — ikke fra det, vi troede vi sendte.
import io, json, os, subprocess, sys, time, urllib.request

PROJEKT = "gjycsqshkvkcupdnvgvf"
FUNKTIONER = ["analyze-draft", "dba-fill-script", "reshopper-draft", "vinted-fill-script"]
FIL = "UDGIVELSER.md"

HOVED = """# Udgivelser

Hver blok herunder er et punkt, der kan vendes tilbage til. Nyeste staar
oeverst. Versionsnumrene er dem, Supabase svarede med lige efter udrulningen,
og indholds-fingeraftrykket er git's eget traehash for funktionens mappe — to
udgivelser med samme fingeraftryk indeholder det samme.

```
./tools/tilbage.sh                      # se listen
./tools/tilbage.sh udgivelse-0003       # hele udgivelsen tilbage
./tools/tilbage.sh udgivelse-0003 dba-fill-script   # kun den ene funktion
./tools/tilbage.sh udgivelse-0003 app   # kun PWAen
```

Filen skrives af `tools/udgiv.sh`. Ret den ikke i haanden.
"""


def kald(*a):
    return subprocess.check_output(a, text=True).strip()


def live_versioner():
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
    if not token:
        return {}
    req = urllib.request.Request(
        "https://api.supabase.com/v1/projects/%s/functions" % PROJEKT,
        headers={"Authorization": "Bearer " + token},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return {f["slug"]: f["version"] for f in json.load(r)}
    except Exception as e:
        print("  (kunne ikke laese versionsnumre: %s)" % e, file=sys.stderr)
        return {}


def traehash(slug):
    try:
        return kald("git", "rev-parse", "HEAD:supabase/functions/" + slug)[:8]
    except subprocess.CalledProcessError:
        return "-"


def stempler():
    html = io.open("index.html", encoding="utf-8").read()
    ud = []
    for f in ("app.js", "style.css"):
        i = html.find(f + "?v=")
        ud.append(html[i:html.find('"', i)] if i > -1 else f + " (ustemplet)")
    return " · ".join(ud)


def main():
    tag = sys.argv[1]
    udrullet = [a for a in sys.argv[2:] if a]
    anledning = os.environ.get("UDGIVELSE_ANLEDNING", "")

    versioner = live_versioner()
    sha = kald("git", "rev-parse", "--short", "HEAD")
    emne = kald("git", "log", "-1", "--format=%s")
    naar = time.strftime("%Y-%m-%d %H:%M")

    linjer = ["## %s — %s" % (tag, naar), ""]
    if anledning:
        linjer.append(anledning)
        linjer.append("")
    linjer += [
        "Commit `%s` — %s  " % (sha, emne),
        "App: `%s`  " % stempler(),
        "Udrullet: %s" % (", ".join(udrullet) if udrullet else "ingen funktioner (kun noteret)"),
        "",
        "| funktion | live | indhold |",
        "|---|---|---|",
    ]
    for f in FUNKTIONER:
        v = versioner.get(f)
        linjer.append("| %s%s | %s | `%s` |" % (
            f,
            " ←" if f in udrullet else "",
            ("v%s" % v) if v else "?",
            traehash(f),
        ))
    blok = "\n".join(linjer) + "\n"

    gammel = io.open(FIL, encoding="utf-8").read() if os.path.exists(FIL) else HOVED
    if "## " in gammel:
        i = gammel.index("## ")
        ny = gammel[:i] + blok + "\n" + gammel[i:]
    else:
        ny = gammel.rstrip() + "\n\n" + blok
    io.open(FIL, "w", encoding="utf-8").write(ny)
    print("  noteret i %s" % FIL)


main()

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generates the remaining whitepaper pages for the content/visual completion
phase, and patches each source article's disabled CTA + data-visual/label
into the enabled, bespoke-diagram state.

Every piece of substantive content used here is extracted directly from
generate-articles.py's real ARTICLES data (dek, whitepaper_title,
whitepaper_teaser, the article's own first paragraph, its own
<li><strong>...</strong> framework items, and its own closing
article-question) — nothing here is invented research or fabricated
statistics. See MAPPING below for the diagram concept assigned to each
article (all concept keys already exist in article-visuals.js).

Run: python3 scripts/generate-whitepapers.py
Reads: /tmp/article_data.json (produced by the one-off AST extractor)
Writes: public/resources/whitepapers/<slug>/index.html (49 new files)
        patches public/resources/<slug>/index.html (CTA + data-visual)
        prints sitemap <url> lines to /tmp/whitepaper_sitemap_additions.xml
"""
import json
import os
import re
import html

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARTICLES_DIR = os.path.join(REPO, "public", "resources")
WP_DIR = os.path.join(REPO, "public", "resources", "whitepapers")
BASE = "https://ashokkumarbishnoi.com"
PUB_DATE_ISO = "2026-09-11"
PUB_DATE_DISPLAY = "September 11, 2026"

with open("/tmp/article_data.json", "r", encoding="utf-8") as f:
    ARTICLE_DATA = {a["slug"]: a for a in json.load(f)}

# slug -> (concept_key, diagram_label_sentence)
MAPPING = {
    "knowing-what-to-change-isnt-changing-it": ("knowing-what-to-change-framework", "Diagram: Knowing and Doing shown as two smooth lines separated by the real gap between them — the step after information."),
    "the-most-dangerous-word-in-business-is-stable": ("the-most-dangerous-word-framework", "Diagram: apparent stability and real resilience shown as two smooth lines separated by the hidden friction most companies don't check for."),
    "the-ai-adoption-gap": ("the-ai-adoption-gap-framework", "Diagram: rollout speed and absorption speed shown as two lines separated by the gap most AI investment quietly falls into."),
    "the-b2b-content-gap": ("the-b2b-content-gap-framework", "Diagram: content volume and genuine conviction shown as two lines separated by what's actually missing."),

    "built-for-a-world-that-no-longer-exists": ("built-for-a-world-framework", "Diagram: a connected network of the specific assumptions a business is built on — how customers find you, how they trust you, what \"fast\" means, what technology now allows."),
    "from-ai-tools-to-ai-organizations": ("from-ai-tools-to-organizations-framework", "Diagram: a connected network of what actually separates a tool purchase from an AI-capable organization — earned trust, retired workflows, new incentives."),
    "the-human-ai-ratio": ("the-human-ai-ratio-framework", "Diagram: a connected network of the three kinds of work — high-volume and defined, judgment calls with real stakes, and everything in between."),
    "the-new-b2b-buying-committee": ("the-new-b2b-buying-committee-framework", "Diagram: a connected network of the stakeholders now on a B2B buying committee — budget holder, technical evaluator, end user, security reviewer."),
    "the-distribution-problem": ("the-distribution-problem-framework", "Diagram: a connected network representing real distribution — a specific relevant list, direct outreach, a plan for proven content."),
    "human-and-automation": ("human-and-automation-framework", "Diagram: a connected network of the real sequence — list the actual tasks, automate the low-judgment ones, redirect the recovered time."),

    "growth-isnt-a-department-its-a-system": ("growth-isnt-a-department-framework", "Diagram: a connected system of what growth as a system actually requires — a shared success metric, cross-team data, product feedback, coordination instead of a silo."),
    "beyond-copilots": ("beyond-copilots-framework", "Diagram: a connected system of what changes when a workflow is redesigned — draft-then-select, sequential-to-parallel, periodic-to-continuous, a genuinely redesigned workflow."),
    "why-b2b-buyers-dont-need-more-content": ("why-b2b-buyers-dont-need-more-content-framework", "Diagram: a connected system for finding and removing a specific doubt — ask stalled deals, listen to reps, check the funnel leak, remove the doubt."),
    "the-content-engine": ("the-content-engine-framework", "Diagram: a connected system where research feeds topics, distribution feeds format, and performance feeds the next piece — a real feedback loop."),
    "from-content-factory-to-intelligence-engine": ("from-content-factory-framework", "Diagram: a connected system of listening first, depth over volume, and a compounding knowledge base — understanding feeding output."),
    "the-modern-inbound-system": ("the-modern-inbound-system-framework", "Diagram: a connected system representing the saturated shared playbook — generic keywords, gated content, generic nurture."),

    "industry-4-0-readiness": ("industry-4-0-readiness-framework", "Diagram: a bar chart of readiness dimensions, with the actual gap — response speed — highlighted."),
    "the-ai-ready-organization": ("the-ai-ready-organization-framework", "Diagram: a bar chart of the four readiness conditions, with the one most likely to fall short highlighted."),
    "the-data-to-decision-gap": ("the-data-to-decision-gap-framework", "Diagram: a bar chart of what closes the data-to-decision gap — named owner, set threshold, decision forum, a real moment."),
    "the-measurement-problem": ("the-measurement-problem-framework", "Diagram: a bar chart contrasting a vague goal with a specific, measurable one — number and timeframe, defined failure."),
    "the-research-advantage": ("the-research-advantage-framework", "Diagram: a bar chart contrasting commentary with firsthand data, credible method, and an original finding."),
    "your-ai-roi-definition-failed": ("your-ai-roi-definition-framework", "Diagram: a bar chart of what a real AI ROI definition requires — pilot type set, metric named, threshold set, real ROI."),

    "digital-transformation-failed-as-a-project": ("digital-transformation-framework", "Diagram: a continuous loop showing why the project structure breaks — an expiration date, milestones hit, shown as a project, ownership that should never sunset."),
    "the-feedback-loop": ("the-feedback-loop-framework", "Diagram: a continuous loop showing exactly where it breaks — insight recorded, not assigned, no mechanism, the loop stays open."),
    "the-experimentation-advantage": ("the-experimentation-advantage-framework", "Diagram: a continuous loop of what fast, clear learning requires — a falsifiable hypothesis, a threshold, a short cycle, learning fast."),
    "think-build-measure-improve": ("think-build-measure-improve-framework", "Diagram: the four-stage loop, named directly — think, build, measure, improve — repeating."),

    "the-ai-buyer": ("the-ai-buyer-framework", "Diagram: a buyer's research path — public information, AI synthesis, first impression, the sales deck, first contact."),
    "the-seven-source-buyer": ("the-seven-source-buyer-framework", "Diagram: a buyer's path across the real sources shaping one decision — review sites, peer conversations, AI synthesis, analyst commentary, the vendor's own site."),
    "the-new-customer-journey": ("the-new-customer-journey-framework", "Diagram: a buyer's path fading into the untracked portion — visible start, private research, AI and peers, untracked, resurfacing."),
    "the-invisible-buying-journey": ("the-invisible-buying-journey-framework", "Diagram: a buyer's path through the phase a CRM can't see — comparison shopping, informal validation, self-serve evaluation, private decision, what the CRM actually sees."),

    "stop-automating-the-friction": ("stop-automating-the-friction-framework", "Diagram: a line breaking upward from automated friction to friction actually removed."),
    "the-end-of-generic-seo": ("the-end-of-generic-seo-framework", "Diagram: a line breaking upward from generic SEO to specific, defensible expertise."),
    "your-company-doesnt-need-more-technology": ("your-company-doesnt-need-more-technology-framework", "Diagram: a line breaking upward from new tools alone to a genuinely new operating rhythm."),

    "ai-isnt-your-strategy-the-work-is": ("ai-isnt-your-strategy-framework", "Diagram: a signal network showing what happens when AI substitutes for strategy — pilots that don't compound, hype-led investment, undefined success."),
    "what-to-stop-before-more-ai": ("what-to-stop-before-more-ai-framework", "Diagram: a signal network of what has to stop before AI helps — no clear owner, untrusted data, tribal knowledge, vague metrics."),
    "when-your-buyer-has-an-ai-assistant": ("when-your-buyer-has-an-ai-assistant-framework", "Diagram: a signal network of what a first sales call now has to do — surface the existing belief, correct directly, go deeper."),

    "the-ai-data-flywheel": ("the-ai-data-flywheel-framework", "Diagram: three connected flows showing what makes it a flywheel — shared ownership, usage feeding back, ongoing data quality."),
    "the-automation-advantage": ("the-automation-advantage-framework", "Diagram: three connected flows of invisible automation — resolved before it's reported, feels attentive, removes waiting."),

    "ai-and-human-creativity": ("ai-and-human-creativity-framework", "Diagram: two curves narrowing from many generated ideas to the one worth keeping."),
    "thought-leadership-that-moves-buyers": ("thought-leadership-framework", "Diagram: two curves narrowing from an opinion to an actual reframe."),

    "ai-without-the-hype": ("ai-without-the-hype-framework", "Diagram: concentric circles centered on a specific, well-scoped question."),
    "from-attention-to-confidence": ("from-attention-to-confidence-framework", "Diagram: concentric circles centered on confidence, the actual point of conversion."),
    "trust-in-the-age-of-ai": ("trust-in-the-age-of-ai-framework", "Diagram: concentric circles centered on verifiable trust, distinct from a generated trust signal."),
    "when-intelligence-is-cheap-judgment-is-expensive": ("when-intelligence-is-cheap-framework", "Diagram: concentric circles centered on judgment, the scarce resource once intelligence is cheap."),

    "ai-needs-better-boundaries": ("ai-needs-better-boundaries-framework", "Diagram: a decision path from a bounded scope to earned authority, not unlimited freedom."),
    "from-dashboard-to-decision": ("from-dashboard-to-decision-framework", "Diagram: a decision path from dashboard input to a human judgment call, not the dashboard as verdict."),
    "the-company-that-decides-first-usually-wins": ("the-company-that-decides-first-framework", "Diagram: a decision path from the decision point to committing first, versus still waiting."),
    "the-decision-ready-business": ("the-decision-ready-business-framework", "Diagram: a decision path from data collected to actually reaching the decision, versus sitting unused."),
    "the-self-educating-buyer": ("the-self-educating-buyer-framework", "Diagram: a decision path from self-educated to helped-to-decide, not educated all over again."),
}

CTA_PATTERN = re.compile(
    r'<div class="portal-row">\s*<span class="status-badge">Whitepaper in production &mdash; not yet available</span>\s*'
    r'<button type="button" class="portal portal-deeper" disabled="" aria-disabled="true">Go deeper: download the research <span class="portal-arrow">&rarr;</span></button>\s*</div>'
)


def strip_tags(s):
    return re.sub(r"<[^>]+>", "", s).strip()


def extract_strongs(body_html):
    """Returns (title, full_sentence) pairs — title is the bolded lead-in
    (e.g. "Decision rights"), full_sentence is the COMPLETE <li> text with
    tags stripped (e.g. "Decision rights. Who is actually allowed to
    decide..."), not just the bolded fragment repeated. This is the exact
    real sentence from the article, verbatim."""
    pairs = []
    for m in re.finditer(r"<li><strong>(.*?)</strong>(.*?)</li>", body_html, re.S):
        title = strip_tags(m.group(1)).rstrip(".").strip()
        full = strip_tags(m.group(0))
        pairs.append((title, full))
    return pairs


def extract_first_paragraph(body_html):
    m = re.search(r"<p>(.*?)</p>", body_html, re.S)
    return m.group(1).strip() if m else ""


def extract_question(body_html):
    m = re.search(r'<div class="article-question">(.*?)</div>', body_html, re.S)
    return strip_tags(m.group(1)) if m else None


def short_label(phrase, max_words=5):
    words = re.sub(r"[?\"]", "", phrase).split()
    return " ".join(words[:max_words]) + ("…" if len(words) > max_words else "")


WP_TEMPLATE = """<!DOCTYPE html>

<html lang="en"><head><meta charset="utf-8"/><meta content="width=device-width,initial-scale=1" name="viewport"/><title>{seo_title}</title><meta content="{meta_desc}" name="description"/><link rel="canonical" href="{canonical}"/><meta name="robots" content="index,follow"/><meta property="og:type" content="article"/><meta property="og:site_name" content="Ashok Kumar Bishnoi"/><meta property="og:title" content="{wp_title}"/><meta property="og:description" content="{meta_desc}"/><meta property="og:url" content="{canonical}"/><meta name="twitter:card" content="summary"/><meta name="twitter:title" content="{wp_title}"/><meta name="twitter:description" content="{wp_teaser}"/><link href="/styles.css" rel="stylesheet"/><link href="/assets/css/agent-widget.css" rel="stylesheet"/><link href="/assets/css/motion.css" rel="stylesheet"/><link href="/assets/css/article.css" rel="stylesheet"/><link href="/assets/css/whitepaper.css" rel="stylesheet"/>
<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": {wp_title_json},
  "description": {meta_desc_json},
  "author": {{"@type": "Person", "name": "Ashok Kumar Bishnoi", "url": "{base}/"}},
  "publisher": {{"@type": "Person", "name": "Ashok Kumar Bishnoi"}},
  "datePublished": "{date_iso}",
  "dateModified": "{date_iso}",
  "mainEntityOfPage": "{canonical}",
  "articleSection": "Whitepaper"
}}
</script>
<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {{"@type": "ListItem", "position": 1, "name": "Resources", "item": "{base}/resources/"}},
    {{"@type": "ListItem", "position": 2, "name": {wp_title_json}, "item": "{canonical}"}}
  ]
}}
</script>
</head><body><header class="site-header"><div class="wrap nav"><a class="brand" href="/">Ashok Kumar Bishnoi</a><nav class="navlinks"><a href="/customer-service-bots/">Customer Service Bots</a><a href="/it-services/">IT Services</a><a href="/marketing-services/">Marketing Services</a><a href="/resources/">Resources</a><a href="/about/">About</a><a href="/contact/">Contact</a><a href="/sign-in/" class="nav-signin">Sign In</a></nav></div></header>

<main class="whitepaper-doc"><div class="wrap">

<section class="whitepaper-cover">
<div class="eyebrow">Whitepaper</div>
<h1>{wp_title}</h1>
<p class="whitepaper-dek">{wp_teaser}</p>
<div class="whitepaper-meta"><span>Ashok Kumar Bishnoi</span><span>&middot;</span><span>{date_display}</span><span>&middot;</span><span>5 min read</span></div>
<div class="whitepaper-print-row"><button type="button" class="whitepaper-print-btn" id="wp-print">Print / Save as PDF</button></div>
</section>

<section class="whitepaper-section">
<div class="kicker">Executive summary</div>
<p>{exec_summary}</p>
</section>

<section class="whitepaper-section">
<div class="kicker">01 &mdash; The pattern</div>
<h2>{article_title}</h2>
<p>{first_paragraph}</p>
{problem_grid}
</section>

<section class="whitepaper-section">
<div class="kicker">02 &mdash; The framework</div>
<h2>What actually closes it</h2>
<div class="article-visual-wrap">
<div class="article-visual" data-visual="{concept_key}" data-visual-label="{diagram_label}"></div>
<p class="article-visual-caption">{diagram_caption}</p>
</div>
{fix_grid}
</section>

<section class="whitepaper-section">
<div class="kicker">03 &mdash; Diagnostic</div>
<h2>Where to look first</h2>
<div class="whitepaper-worksheet">
<ol>
{worksheet_items}
</ol>
</div>
</section>

<div class="talk-to-ashok">
<div class="eyebrow">Talk to Ashok</div>
<p class="lead">Tell me where you are. Tell me where you want to go. We'll figure out the next move.</p>
<a class="portal portal-talk" href="/contact/">Talk to Ashok <span class="portal-arrow">&rarr;</span></a>
</div>

<p class="whitepaper-source-note">This whitepaper expands the framework introduced in the article <a href="/resources/{slug}/">{article_title}</a>. It reflects the author's own consulting framework, developed through direct client work &mdash; not a third-party research study. Published {date_display} by Ashok Kumar Bishnoi.</p>

</div></main>

<footer class="footer"><div class="wrap footergrid"><div>We help people run faster in Industry 4.0.</div><div><a href="/customer-service-bots/">Customer Service Bots</a> &middot; <a href="/it-services/">IT Services</a> &middot; <a href="/marketing-services/">Marketing Services</a></div><div><a href="/privacy/">Privacy</a> &middot; <a href="/cookie-policy/">Cookies</a> &middot; <a href="/terms/">Terms</a></div></div></footer><script src="/assets/js/agent-widget.js"></script><script src="/assets/js/motion.js" defer=""></script><script src="/assets/js/article-visuals.js" defer=""></script>
<script>
(function () {{
  "use strict";
  var btn = document.getElementById("wp-print");
  if (btn) {{ btn.addEventListener("click", function () {{ window.print(); }}); }}
}})();
</script>
</body></html>
"""


def framework_grid(items, kind):
    if not items:
        return ""
    cards = []
    for title, full in items:
        label = short_label(title, 6) if len(title.split()) > 6 else title
        klass = "" if kind == "input" else " output"
        cards.append(
            f'<div class="whitepaper-framework-card{klass}"><div class="card-label">{kind.title()}</div><h3>{html.escape(label)}</h3><p>{html.escape(full)}</p></div>'
        )
    return '<div class="whitepaper-framework-grid">\n' + "\n".join(cards) + "\n</div>"


def build_worksheet(strong_pairs, question):
    qs = [full for _, full in strong_pairs if full.strip().endswith("?")]
    items = []
    if question:
        items.append(question)
    for q in qs:
        if q not in items:
            items.append(q)
    items = items[:5]
    return "\n".join(f"<li>{html.escape(q)}</li>" for q in items)


def generate(slug):
    a = ARTICLE_DATA[slug]
    concept_key, diagram_label = MAPPING[slug]
    strongs = extract_strongs(a["body_html"])
    question = extract_question(a["body_html"])
    first_para = extract_first_paragraph(a["body_html"])

    # First half of named items = the pattern/problem; second half = the fix.
    # Most articles' <li><strong> lists run problem-set then fix-set in that
    # order (verified across the sample read during design) — when a
    # single flat list can't be honestly split, only the "input" half is
    # populated and the framework section relies on the diagram + fix
    # paragraph instead of fabricating a second half.
    half = max(1, len(strongs) // 2)
    problem_items = strongs[:half][:4]
    fix_items = strongs[half:][:4]

    worksheet = build_worksheet(strongs, question)
    if not worksheet:
        # No question-form content and no closing question exists for this
        # article — do not fabricate one. Falls back to the real closing
        # question only if present; if truly absent, mark honestly.
        worksheet = "<li><em>No source-supported diagnostic question was available for this article — NOT COMPLETED for this section.</em></li>"

    canonical = f"{BASE}/resources/whitepapers/{slug}/"
    wp_title = a["whitepaper_title"]
    wp_teaser = a["whitepaper_teaser"]
    exec_summary = f"{a['dek']} {wp_teaser}"

    html_out = WP_TEMPLATE.format(
        seo_title=html.escape(f"{wp_title} | Ashok Kumar Bishnoi"),
        meta_desc=html.escape(wp_teaser),
        meta_desc_json=json.dumps(wp_teaser),
        canonical=canonical,
        wp_title=html.escape(wp_title),
        wp_title_json=json.dumps(wp_title),
        wp_teaser=html.escape(wp_teaser),
        base=BASE,
        date_iso=PUB_DATE_ISO,
        date_display=PUB_DATE_DISPLAY,
        exec_summary=html.escape(exec_summary),
        article_title=html.escape(a["title"]),
        first_paragraph=first_para,
        problem_grid=framework_grid(problem_items, "input"),
        concept_key=concept_key,
        diagram_label=html.escape(diagram_label),
        diagram_caption=html.escape(diagram_label.split(": ", 1)[-1] if ": " in diagram_label else diagram_label),
        fix_grid=framework_grid(fix_items, "output"),
        worksheet_items=worksheet,
        slug=slug,
    )

    out_dir = os.path.join(WP_DIR, slug)
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(html_out)
    return concept_key, diagram_label, len(problem_items), len(fix_items), len(worksheet.split("<li>")) - 1


def patch_article(slug, concept_key, diagram_label):
    path = os.path.join(ARTICLES_DIR, slug, "index.html")
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    new_cta = (
        '<div class="portal-row">\n'
        f'<a class="portal portal-deeper" href="/resources/whitepapers/{slug}/">Go deeper: read the whitepaper <span class="portal-arrow">&rarr;</span></a>\n'
        "</div>"
    )
    content, n_cta = CTA_PATTERN.subn(new_cta, content)

    old_visual_pattern = re.compile(r'data-visual="[a-zA-Z0-9_-]+" data-visual-label="[^"]*"')
    content, n_visual = old_visual_pattern.subn(f'data-visual="{concept_key}" data-visual-label="{html.escape(diagram_label)}"', content, count=1)

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    return n_cta, n_visual


if __name__ == "__main__":
    sitemap_lines = []
    report = []
    for slug in MAPPING:
        concept_key, diagram_label, n_problem, n_fix, n_worksheet = generate(slug)
        n_cta, n_visual = patch_article(slug, concept_key, diagram_label)
        sitemap_lines.append(f'<url><loc>{BASE}/resources/whitepapers/{slug}/</loc><lastmod>{PUB_DATE_ISO}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>')
        report.append({"slug": slug, "cta_patched": n_cta, "visual_patched": n_visual, "problem_items": n_problem, "fix_items": n_fix, "worksheet_items": n_worksheet})

    with open("/tmp/whitepaper_sitemap_additions.xml", "w", encoding="utf-8") as f:
        f.write("\n".join(sitemap_lines))

    print(f"Generated {len(MAPPING)} whitepapers.")
    problems = [r for r in report if r["cta_patched"] != 1 or r["visual_patched"] != 1]
    if problems:
        print("WARNING — patch mismatches:", problems)
    else:
        print("All article CTA + data-visual patches applied exactly once each.")
    thin = [r for r in report if r["problem_items"] == 0 or r["fix_items"] == 0]
    if thin:
        print("Articles with thin framework grids (0 problem or 0 fix items):", [r["slug"] for r in thin])
    no_worksheet = [r for r in report if r["worksheet_items"] == 0]
    if no_worksheet:
        print("Articles with NO real diagnostic question available (marked NOT COMPLETED):", [r["slug"] for r in no_worksheet])
    print(f"Sitemap entries written to /tmp/whitepaper_sitemap_additions.xml ({len(sitemap_lines)} lines)")

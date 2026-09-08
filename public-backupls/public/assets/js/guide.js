/* ---------------------------------------------------------------------------
   Guided diagnostic.

   Two questions, then a recommendation. Entirely deterministic and local:
   no network calls, no AI API, no data collection, no storage.

   Progressive enhancement contract:
   - The page ships a static <noscript>-equivalent fallback inside
     [data-guide-fallback]. It is visible by default.
   - This script only runs if it can find its mount point. It then hides the
     fallback and renders the interactive flow.
   - If the script fails to load, the visitor still sees a usable list of
     services and a way to start a conversation.

   Analytics hooks: every rendered control carries data-event so a tracking
   snippet can be attached later without touching this file.
   --------------------------------------------------------------------------- */
(function () {
  "use strict";

  var mount = document.getElementById("guide");
  if (!mount) return;

  var fallback = document.querySelector("[data-guide-fallback]");

  /* ---------------------------------------------------------------------
     Recommendations
     --------------------------------------------------------------------- */
  var RECS = {
    "website-product-copy": {
      service: "Website & Product Copy",
      url: "/services/website-product-copy/",
      verdict:
        "Start with the pages you already have. Adding more content on top of a website that doesn't explain the product clearly just spreads the confusion over more URLs.",
      solves: [
        "Buyers who leave the homepage still unsure what you sell",
        "Product and solution pages that describe features instead of decisions",
        "A messaging story that changes depending on who in the company tells it"
      ],
      proof: {
        label: "Website and solution pages across conversational AI, contact-centre and identity-automation products",
        href: "/work/#website-copy"
      },
      article: { href: "/insights/saas-website-clarity-problem/", label: "Your SaaS website doesn't have a traffic problem. It has a clarity problem." }
    },
    "technical-seo-content": {
      service: "Technical SEO Content",
      url: "/services/technical-seo-content/",
      verdict:
        "You need research-led articles built around what your buyers actually search for — written by someone who can read the product docs without a translator.",
      solves: [
        "A blog that ranks for terms your buyers never type",
        "Technical topics no generalist writer can cover credibly",
        "Publishing with no map of which topics lead to revenue"
      ],
      proof: {
        label: "273% traffic growth: 2.6K to 7.1K monthly users in a year",
        href: "/work/#saas-growth"
      },
      article: { href: "/insights/b2b-saas-content-written-for-google/", label: "Most B2B SaaS content is written for Google. That's the problem." }
    },
    "thought-leadership": {
      service: "Thought Leadership",
      url: "/services/thought-leadership/",
      verdict:
        "The raw material is already inside your company. The work is getting it out of your founder's head and into a form the market can read.",
      solves: [
        "Founders with hard-won opinions and no published record of them",
        "Executive content that reads like a press release",
        "A LinkedIn presence with reach but no argument"
      ],
      proof: {
        label: "Thought leadership, whitepapers and long-form work across 600+ content projects",
        href: "/work/#range"
      },
      article: { href: "/insights/most-b2b-thought-leadership-isnt/", label: "Why most B2B thought leadership isn't thought leadership." }
    },
    "case-studies": {
      service: "Case Studies & Sales Content",
      url: "/services/case-studies/",
      verdict:
        "Sales is losing deals to doubt, not to price. Proof documents do a specific job in the middle of a deal, and most companies never build them properly.",
      solves: [
        "No credible evidence you have solved this exact problem before",
        "Nothing useful to send after a first call",
        "Technical evaluators who need more than a datasheet"
      ],
      proof: {
        label: "One case study that generated 100+ sales-qualified leads in six months",
        href: "/work/#case-study-sqls"
      },
      article: { href: "/insights/traffic-versus-buyers/", label: "The difference between content that gets traffic and content that gets buyers." }
    },
    "content-strategy": {
      service: "Content Strategy",
      url: "/services/content-strategy/",
      verdict:
        "The problem isn't output. It's that nobody has decided what the content is for. Fix the decision layer first and the execution gets much cheaper.",
      solves: [
        "Publishing that starts strong and quietly stops",
        "Content nobody in sales or product actually uses",
        "No way to tell which pieces are working and which are decoration"
      ],
      proof: {
        label: "1000+ content briefs and roadmaps built for B2B technology teams",
        href: "/work/#range"
      },
      article: { href: "/insights/stop-publishing-12-saas-blogs-a-month/", label: "Stop publishing 12 SaaS blogs a month." }
    },
    conversation: {
      service: "A conversation first",
      url: "/start-a-project/",
      verdict:
        "You don't need to know the answer yet. Most companies arrive with a symptom rather than a diagnosis, and working out which one you have is the useful part.",
      solves: [
        "Send the product, the audience and the problem",
        "I'll tell you where I think the real gap is",
        "If the honest answer is that you don't need me, I'll say so"
      ],
      proof: {
        label: "Seven years, 600+ projects, 80+ clients across B2B technology",
        href: "/work/"
      },
      article: { href: "/insights/small-saas-better-content/", label: "Small SaaS companies don't need more content. They need better content." }
    }
  };

  /* ---------------------------------------------------------------------
     Flow
     --------------------------------------------------------------------- */
  var GOALS = [
    {
      id: "product",
      label: "Explain our product better",
      question: "What's getting in the way?",
      options: [
        { label: "People don't understand what we do", rec: "website-product-copy" },
        { label: "The site gets visits but almost no enquiries", rec: "website-product-copy" },
        { label: "Our product and solution pages are thin", rec: "website-product-copy" },
        { label: "Sales says the site doesn't match what buyers ask", rec: "case-studies" },
        { label: "Something else", rec: "conversation" }
      ]
    },
    {
      id: "traffic",
      label: "Get more qualified organic traffic",
      question: "Where are you now?",
      options: [
        { label: "We have very little organic traffic", rec: "technical-seo-content" },
        { label: "Traffic exists, but it's the wrong people", rec: "content-strategy" },
        { label: "Rankings have flattened out", rec: "technical-seo-content" },
        { label: "We don't have a content strategy", rec: "content-strategy" },
        { label: "We publish consistently and results are still flat", rec: "content-strategy" }
      ]
    },
    {
      id: "authority",
      label: "Build founder or executive authority",
      question: "Where's the gap?",
      options: [
        { label: "The founder has the expertise but publishes nothing", rec: "thought-leadership" },
        { label: "We publish, but there's no real point of view", rec: "thought-leadership" },
        { label: "LinkedIn presence needs substance behind it", rec: "thought-leadership" },
        { label: "We need long-form pieces that carry weight", rec: "thought-leadership" },
        { label: "We want a complete authority programme", rec: "content-strategy" }
      ]
    },
    {
      id: "sales",
      label: "Give sales better content",
      question: "What does sales keep asking for?",
      options: [
        { label: "Proof we've solved this problem before", rec: "case-studies" },
        { label: "Something worth sending after a first call", rec: "case-studies" },
        { label: "A deeper document for technical evaluators", rec: "case-studies" },
        { label: "Material that explains the product to non-technical buyers", rec: "website-product-copy" },
        { label: "We're not sure what sales actually needs", rec: "content-strategy" }
      ]
    },
    {
      id: "launch",
      label: "Launch something new",
      question: "What does the launch need most?",
      options: [
        { label: "Positioning and messaging the whole team can use", rec: "website-product-copy" },
        { label: "The website and product pages", rec: "website-product-copy" },
        { label: "Explainers and technical content around the release", rec: "technical-seo-content" },
        { label: "Search visibility for a category nobody knows yet", rec: "technical-seo-content" },
        { label: "A plan, not just assets", rec: "content-strategy" }
      ]
    },
    {
      id: "engine",
      label: "Build a consistent content engine",
      question: "What breaks down today?",
      options: [
        { label: "We start strong, then it quietly stops", rec: "content-strategy" },
        { label: "Nobody internally owns it", rec: "content-strategy" },
        { label: "Quality drops as soon as we scale volume", rec: "technical-seo-content" },
        { label: "We can't tell whether any of it works", rec: "content-strategy" },
        { label: "We have a plan but nobody to execute it", rec: "technical-seo-content" }
      ]
    },
    {
      id: "unsure",
      label: "I'm not sure yet",
      question: null,
      rec: "conversation"
    }
  ];

  /* ---------------------------------------------------------------------
     Rendering
     --------------------------------------------------------------------- */
  var state = { goal: null };

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "text") node.textContent = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) { node.appendChild(c); });
    return node;
  }

  function focusHeading() {
    var h = mount.querySelector("[data-guide-focus]");
    if (h) h.focus();
  }

  function renderStep(opts) {
    // opts: { step, of, question, options, onBack }
    mount.textContent = "";

    var progress = el("p", { class: "guide-progress" });
    progress.appendChild(el("span", { text: "Step " + opts.step + " of " + opts.of }));
    if (opts.onBack) {
      var back = el("button", { type: "button", class: "guide-back", text: "Start over", "data-event": "guide-restart" });
      back.addEventListener("click", opts.onBack);
      progress.appendChild(back);
    }
    mount.appendChild(progress);

    mount.appendChild(
      el("h3", {
        class: "guide-question",
        text: opts.question,
        tabindex: "-1",
        "data-guide-focus": ""
      })
    );

    var list = el("ul", { class: "guide-options" });
    opts.options.forEach(function (opt) {
      var button = el("button", {
        type: "button",
        class: "guide-option",
        text: opt.label,
        "data-event": opt.event
      });
      button.addEventListener("click", opt.onSelect);
      list.appendChild(el("li", null, [button]));
    });
    mount.appendChild(list);
  }

  function renderStart() {
    state.goal = null;
    renderStep({
      step: 1,
      of: 2,
      question: "What are you trying to improve?",
      options: GOALS.map(function (goal) {
        return {
          label: goal.label,
          event: "guide-goal-" + goal.id,
          onSelect: function () { selectGoal(goal); }
        };
      })
    });
  }

  function selectGoal(goal) {
    state.goal = goal;
    if (!goal.question) { renderResult(goal.rec); return; }
    renderStep({
      step: 2,
      of: 2,
      question: goal.question,
      onBack: renderStart,
      options: goal.options.map(function (opt) {
        return {
          label: opt.label,
          event: "guide-answer-" + goal.id,
          onSelect: function () { renderResult(opt.rec); }
        };
      })
    });
    focusHeading();
  }

  function renderResult(key) {
    var rec = RECS[key];
    if (!rec) rec = RECS.conversation;

    mount.textContent = "";

    var progress = el("p", { class: "guide-progress" });
    progress.appendChild(el("span", { text: "Recommendation" }));
    var restart = el("button", { type: "button", class: "guide-back", text: "Start over", "data-event": "guide-restart" });
    restart.addEventListener("click", function () { renderStart(); focusHeading(); });
    progress.appendChild(restart);
    mount.appendChild(progress);

    var wrap = el("div", { class: "guide-result" });

    wrap.appendChild(
      el("h3", {
        text: key === "conversation" ? "Start with a conversation" : "Start with " + rec.service,
        tabindex: "-1",
        "data-guide-focus": ""
      })
    );
    wrap.appendChild(el("p", { class: "guide-verdict", text: rec.verdict }));

    wrap.appendChild(el("h4", { text: key === "conversation" ? "How it works" : "What it solves" }));
    var ul = el("ul");
    rec.solves.forEach(function (s) { ul.appendChild(el("li", { text: s })); });
    wrap.appendChild(ul);

    var routes = el("ul", { class: "guide-routes" });

    if (key !== "conversation") {
      routes.appendChild(
        el("li", null, [
          el("span", { class: "guide-route-label", text: "The service" }),
          el("a", { href: rec.url, text: rec.service, "data-event": "guide-route-service" })
        ])
      );
    }

    routes.appendChild(
      el("li", null, [
        el("span", { class: "guide-route-label", text: "The proof" }),
        el("a", { href: rec.proof.href, text: rec.proof.label, "data-event": "guide-route-proof" })
      ])
    );

    if (rec.article) {
      routes.appendChild(
        el("li", null, [
          el("span", { class: "guide-route-label", text: "Read first" }),
          el("a", { href: rec.article.href, text: rec.article.label, "data-event": "guide-route-insight" })
        ])
      );
    }

    wrap.appendChild(routes);

    var row = el("div", { class: "btn-row" });
    row.appendChild(
      el("a", {
        class: "btn",
        href: "/start-a-project/",
        text: "Start a conversation",
        "data-event": "guide-cta-start"
      })
    );
    if (key !== "conversation") {
      row.appendChild(
        el("a", { class: "btn btn--quiet", href: rec.url, text: "Explore the service", "data-event": "guide-cta-service" })
      );
    }
    wrap.appendChild(row);

    wrap.appendChild(
      el("p", {
        class: "meta mb-0",
        text: "Nothing you selected was sent anywhere. This runs entirely in your browser."
      })
    );

    mount.appendChild(wrap);
    focusHeading();
  }

  /* ---------------------------------------------------------------------
     Boot
     --------------------------------------------------------------------- */
  if (fallback) fallback.classList.add("is-hidden");
  mount.setAttribute("aria-live", "polite");
  mount.classList.remove("is-hidden");
  renderStart();
})();

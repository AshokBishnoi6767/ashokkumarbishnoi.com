"use strict";

// Real site content only — copied from public/services/index.html and
// public/index.html verbatim, not invented. If the site copy changes,
// this must be updated to match; it is not generated from the live pages.
const STAGES = [
  {
    id: "BUILDING",
    label: "01 — BUILDING",
    summary: "You have a business. Now you need a digital foundation.",
    detail: "Websites, apps, brand identity, UI/UX, graphics, video & animation, digital infrastructure — everything needed to show up, look credible, and start moving.",
    cta: { text: "Build Your Foundation", href: "/contact/" },
  },
  {
    id: "ACCELERATING",
    label: "02 — ACCELERATING",
    summary: "You're online. But something isn't moving fast enough.",
    detail: "Positioning, content, SEO, UX, conversion, systems, data — finding the friction, then removing it.",
    cta: { text: "Accelerate", href: "/contact/" },
  },
  {
    id: "ADVANCING",
    label: "03 — ADVANCING",
    summary: "Digital is working. Now you want more from it.",
    detail: "Getting noticed (SEO, social, content, creative), getting remembered (copy, video, thought leadership), starting conversations (email, PPC, paid media), and turning attention into growth (landing pages, conversion, performance).",
    cta: { text: "Start Growing", href: "/contact/" },
  },
  {
    id: "FLYING",
    label: "04 — FLYING",
    summary: "You're already ahead. Now let's find the next lever.",
    detail: "Not another 3% — the market you've overlooked, the process you can automate, the data you're not using, the channel you're underinvesting in, the growth loop nobody has built yet.",
    cta: { text: "Find The Lever", href: "/contact/" },
  },
];

const SITE_LINKS = {
  services: "/services/",
  about: "/about/",
  resources: "/resources/",
  contact: "/contact/",
};

const POSITIONING = "We help people run faster in Industry 4.0. Business doesn't stand still. Neither should the way you build, operate and grow it.";

function buildPublicSystemPrompt() {
  return [
    "You are the Industry 4.0 Navigator for ashokkumarbishnoi.com, a public-facing assistant.",
    `Site positioning: "${POSITIONING}"`,
    "Your job: help visitors understand what the site does, explain relevant Industry 4.0 concepts, identify which of the four stages fits them, diagnose likely friction, recommend the relevant page, and offer a human conversation via /contact/ when appropriate.",
    "The four stages, in the site's own words:",
    ...STAGES.map((s) => `${s.label}: ${s.summary} ${s.detail}`),
    "You have NO access to any private data, dashboard, calendar, CRM, files, credentials, or administrative capability of any kind. You cannot take any action — you can only inform, diagnose, and recommend a page or a human conversation.",
    "Never claim to remember a previous visitor or session. Never invent services, pricing, team members, or claims not stated here.",
  ].join("\n");
}

module.exports = { STAGES, SITE_LINKS, POSITIONING, buildPublicSystemPrompt };

# Football Trivia Battle — Modernisation Direction

> **Nature of this note:** A flexible product direction for future vibe-coding,
> not a specification, roadmap, or commitment. We should test ideas, change
> course quickly, and avoid treating any feature below as decided until it
> proves useful for real players.

## Why we are changing

Football Trivia Battle has received installs through Google Ads, but its current
penalty-shootout / Quick Match experience is not retaining users or generating
sustainable revenue. The goal is to modernise the mobile game into something
football fans will want to return to, while preserving and reusing worthwhile
parts of the existing app where they help.

## Product influence

The main reference is [Football Quiz! Ultimate Trivia on Google Play](https://play.google.com/store/apps/details?id=com.football.quiz.trivia).

We are taking inspiration from the *product patterns* that make it accessible:

- immediate, low-friction football trivia;
- a large feeling content collection across players, clubs, competitions, and
  football history;
- short solo sessions that work offline;
- a sense of progression, discovery, and increasing challenge;
- optional daily reasons to return; and
- a light economy where players can get help when they are stuck.

This is inspiration, not a request to reproduce its screens, content, assets,
copy, branding, or mechanics exactly. Football Trivia Battle should develop a
clear identity of its own.

## Initial working hypotheses

These are hypotheses to explore, not fixed requirements:

- Solo play should be a welcoming primary path; real-time multiplayer should
  not be required before a new player can enjoy their first quiz.
- A campaign, themed collections, daily challenge, career-path puzzle, or
  another repeatable football-fan loop may serve retention better than a single
  standalone match. We will prototype and learn rather than choose now.
- The existing animated penalty shootout may remain as a distinctive Battle
  mode, competitive mode, reward, or visual theme if it earns its place.
- Existing foundations worth considering include the localised question bank,
  Android/Capacitor build, daily rewards, coins, cosmetics, friends, analytics,
  and multiplayer service. None need to dictate the new experience.
- Revenue should follow player value: voluntary rewarded ads, helpful hints,
  cosmetics, and/or an ad-free purchase are worth investigating. Avoid a design
  that interrupts every short play session with forced ads.

## Content and rights guardrail

Do not copy competitor content or assume that a public football image is free
to use. Club crests, player photographs, kits, names, and likenesses can carry
separate copyright, trade-mark, photography, and image-rights considerations.

The competitor appears to use stylised player artwork and altered club marks in
some places. That does not establish that we can use the same approach safely.
For this project, favour original art, original generic iconography, properly
licensed assets, and text/clue-driven football questions unless rights have
been checked for a particular asset.

Google Play requires developers to own or have the required permissions for
third-party material used in an app or its listing. Its policy specifically
calls out professional sports team logos and professional images of public
figures as common infringement examples. See [Google Play's Intellectual
Property policy](https://support.google.com/googleplay/android-developer/answer/9888072?hl=en).

## How we will work

Future changes should stay mobile-first and be delivered as small, observable
experiments. Before committing to a larger redesign, define the player outcome
being tested, instrument it where practical, and use install, first-session,
completion, return, and monetisation signals to decide what deserves another
iteration.

The central question is simple: **does this give a football fan a satisfying
reason to play one more round today and return tomorrow?**

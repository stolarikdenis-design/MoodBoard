# Focení

Plánovač focení do telefonu. Funguje jako aplikace na ploše a i bez signálu.

- **Moodboard:** nahraješ screenshoty a aplikace z nich sama vyřízne samotnou fotku (bez lišt, textu a ikon Instagramu nebo Pinterestu). Pak je ořízne přesně na poměr fotek (3:2, 4:3, 5:4, 16:9, 1:1) a nalepí je do koláže krepovou a průhlednou páskou. Deska na šířku 16:9, story 9:16, příspěvek 4:5 nebo čtverec. Zamíchat přeskládá koláž, Zvětšit ji ukáže přes celou obrazovku. Klepnutím na fotku posuneš a přiblížíš výřez, vrátíš se k celému screenshotu, otočíš ji nebo ji dáš navrch. Uložit obrázek udělá PNG.
- **Příprava z moodboardu:** Claude projde fotky z moodboardu a připraví pózy (s náhledem fotky, ze které vychází, a popisem, jak modela navést), rekvizity (z inventáře, co chybí jako „Sehnat“), oblečení a styling, světlo a barvy, vhodná místa (z uložených lokalit i typy míst k hledání) a na co si dát pozor. Dvě cesty:
  - **Připravit** (přímo v appce): potřebuje vlastní API klíč z platform.claude.com, zadává se v Nastavení (⋯). V Nastavení je i kvalita: **Úsporně** (Claude Haiku 5.5, asi 0,1 Kč za přípravu, výchozí) a **Nejlíp** (Claude Opus 5.5, asi 2–6 Kč). Klíč zůstane jen v telefonu, fotky se při přípravě pošlou do Anthropicu.
  - **Zdarma přes appku Claude** (v rámci předplatného): appka pošle fotky a zadání do appky Claude, odpověď zkopíruješ a vložíš zpátky.
- **Plán:** název, model, datum a čas, lokalita s mapou, pózy, oblečení a styling, poznámky.
- **Checklist:** co si vzít s sebou (i z inventáře) a co hlídat během focení.
- **Inventář:** props s fotkou, kategorií, počtem a poznámkou.
- **Lokality:** uložená místa na mapě s fotkami, popisem a navigací.

Data jsou jen v telefonu (IndexedDB). Záloha: Focení → ⋯ → Stáhnout zálohu.

## Instalace do telefonu

iPhone: Safari → Sdílet → Přidat na plochu. Android: Chrome → ⋮ → Instalovat aplikaci.

## Vývoj

Čisté HTML, CSS a JS bez buildu. Písma Inter, Instrument Serif a JetBrains Mono jsou v `lib/fonts` (OFL). Anthropic SDK je zabalené v `lib/anthropic/sdk.js` (`npm run vendor:sdk` po aktualizaci balíčku). Mapa Leaflet 1.9.4 (`lib/leaflet`), dlaždice OpenStreetMap.

```bash
npm install
npm run dev     # http://127.0.0.1:4300
npm test        # unit testy koláže a ořezu + e2e v Playwrightu (Claude je v testech podvržený)
```

Při změně souborů zvedni `VERSION` v `sw.js`, ať se telefonům stáhne nová verze.

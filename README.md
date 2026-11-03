# Focení

Plánovač focení do telefonu. Funguje jako aplikace na ploše a i bez signálu.

- **Moodboard:** nahraješ screenshoty, aplikace je ořízne přesně na poměr fotek (3:2, 4:3, 5:4, 16:9, 1:1) a nalepí je do koláže krepovou a průhlednou páskou. Deska na šířku 16:9, story 9:16, příspěvek 4:5 nebo čtverec. Zamíchat přeskládá koláž, klepnutím na fotku posuneš výřez, otočíš ji nebo ji dáš navrch. Uložit obrázek udělá PNG.
- **Plán:** název, model, datum a čas, lokalita s mapou, pózy, poznámky.
- **Checklist:** co si vzít s sebou (i z inventáře) a co hlídat během focení.
- **Inventář:** props s fotkou, kategorií, počtem a poznámkou.
- **Lokality:** uložená místa na mapě s fotkami, popisem a navigací.

Data jsou jen v telefonu (IndexedDB). Záloha: Focení → ⋯ → Stáhnout zálohu.

## Instalace do telefonu

iPhone: Safari → Sdílet → Přidat na plochu. Android: Chrome → ⋮ → Instalovat aplikaci.

## Vývoj

Čisté HTML, CSS a JS bez buildu. Mapa Leaflet 1.9.4 (`lib/leaflet`), písmo Special Elite (`lib/special-elite`, Apache 2.0), dlaždice OpenStreetMap.

```bash
npm install
npm run dev     # http://127.0.0.1:4300
npm test        # unit testy koláže + e2e v Playwrightu
```

Při změně souborů zvedni `VERSION` v `sw.js`, ať se telefonům stáhne nová verze.

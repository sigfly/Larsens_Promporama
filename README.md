# Larsens Promporama

Startpunktet er `index.html`. Bilder og lyder er bevart uten endring.

## Kjøring

For utvikling: kjør `python -m http.server 8000` i denne mappen og åpne
http://localhost:8000. Lydfilene lastes med fetch og trenger HTTP, ikke file://.
Ingen pakkeinstallasjon eller eksterne tjenester kreves.

For bruk uten nett: åpne `offline.html` direkte i nettleseren. Denne filen
inneholder all kode, alle bilder og alle lyder og kan kopieres alene.

## Struktur

- `index.html`: scene, knapper og testpanel
- `styles/scene.css`: utseende og responsiv tilpasning
- `scripts/media.js`: mediereferanser og animasjonsdata
- `scripts/scene.js`: lyd, animasjon, poeng og hendelser
- `assets/images/`, `assets/audio/`: originale mediefiler
- `tools/build_offline.py`: bygger offlinefilen fra kildefilene
- `tests/playback.cjs`: regresjonstester for avspilling

Etter endringer: kjør `python tools/build_offline.py`.
Test med `node tests/playback.cjs`.

Klikk **Promp ivei** når teppet er åpnet. Ctrl+Shift+D viser testpanelet;
Escape skjuler det. Pause/Resume stanser og fortsetter både lyd og animasjon.
Automatisk avspilling venter til begge lydklipp er ferdige før neste pause.

Ved retur fra bakgrunnsfane starter ikke utløpte skyer på nytt. Feilet
lydavspilling gir ikke poeng eller sky. Stopp avbryter også ventende
HTML-lydavspilling i reservemodus.

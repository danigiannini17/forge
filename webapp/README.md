# Card Forge — Multiplayer WebApp (`webapp/`)

Web application multiplayer per **Card Forge** che consente di creare o partecipare a stanze tramite **ID Stanza** e **Password**, riconoscere i giocatori tramite token di sessione (riconnessione automatica al refresh), scegliere o costruire mazzi (inclusi **Commander / EDH** fino a 8 giocatori e **Constructed**), aggiungere bot IA e giocare nel browser usando il motore ufficiale di Forge (`forge-game`, `forge-ai`, `forge-gui`).

## Struttura

- `forge-web/`: Server Java 17 (Javalin + WebSocket) che inizializza `FModel` in modalità headless (`HeadlessWebGuiBase`), gestisce le stanze (`RoomManager`, `GameRoom`, `WebGameLobby`), il catalogo mazzi (`DeckCatalogService`) e il bridge di partita in tempo reale (`WebGuiGame`, `GameStateSerializer`).
- `frontend/`: Interfaccia React 18 + TypeScript + Vite con Lobby, Deck Builder & Importer, Tavolo di Gioco completo (Commander Zone, Commander Tax & Danni da Comandante, Immagini Scryfall + fallback SVG, Auto-Pass, Stop sulle 13 Fasi, Undo `Ctrl+Z`, Ispettore Carte, Modali per Mulligan / Scry / Tutori / Danni).
- `start-webapp.sh`: Script di avvio rapido.

## Come avviare la WebApp

1. Assicurati di aver installato i moduli core di Forge nel repository Maven locale (solo la prima volta):
   ```bash
   mvn -N install -DskipTests -Dcheckstyle.skip=true
   mvn -pl forge-core,forge-game,forge-ai,forge-gui install -DskipTests -Dcheckstyle.skip=true
   ```
2. Compila e avvia il server web (porta predefinita `8080`):
   ```bash
   cd webapp/forge-web
   mvn compile -Dcheckstyle.skip=true
   cd ..
   ./start-webapp.sh
   ```
3. Apri `http://localhost:8080` nel browser.

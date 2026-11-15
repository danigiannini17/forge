# Lozzander Online — Guida Completa alla WebApp Multiplayer (`webapp/`)

Questa guida spiega passo dopo passo **come compilare e avviare** **Lozzander Online** sul tuo computer o server e **come utilizzarla** per giocare a *Magic: The Gathering* (incluso **Commander / EDH** fino a 8 giocatori e **Constructed**) insieme ai tuoi amici o contro i bot IA.

---

## 1. Requisiti di Sistema

Assicurati di avere installati:
- **Java 17+** (JDK 17 o superiore, richiesto dal motore di gioco `2.0.17-SNAPSHOT`).
  - Verifica con: `java -version`
- **Apache Maven 3.8+**
  - Verifica con: `mvn -version`
- **Node.js 18+ e npm** *(opzionale se usi la build già inclusa in `webapp/frontend/dist/`, necessario solo se modifichi il codice React in `webapp/frontend/src/`)*.

---

## 2. Come Avviare la WebApp

### Passo 1 — Installazione dei moduli base (solo la prima volta)
Dalla cartella principale della repository (`forge/`), installa nel tuo repository Maven locale (`~/.m2`) i moduli core del motore di gioco (`forge-core`, `forge-game`, `forge-ai`, `forge-gui`):

```bash
# Dalla root del progetto (forge/)
mvn -N install -DskipTests -Dcheckstyle.skip=true
mvn -pl forge-core,forge-game,forge-ai,forge-gui install -DskipTests -Dcheckstyle.skip=true
```
*(Questa operazione serve solo la prima volta o quando aggiorni i moduli core).*

### Passo 2 — Compilazione del Server Web (`webapp/forge-web`)
Entra nella cartella del backend web e compila il progetto:

```bash
cd webapp/forge-web
mvn compile -Dcheckstyle.skip=true
cd ../..
```

*(Opzionale: se hai modificato il frontend React dentro `webapp/frontend/src`, ricompila il bundle statico con `cd webapp/frontend && npm install && npm run build`).*

### Passo 3 — Avvio del Server
Puoi avviare il server direttamente tramite lo script [`webapp/start-webapp.sh`](start-webapp.sh):

```bash
./webapp/start-webapp.sh
```

Di default il server parte sulla porta **`8080`**. Se vuoi cambiare porta (ad esempio `3000` o `9090`), passa la variabile d'ambiente `PORT`:

```bash
PORT=9090 ./webapp/start-webapp.sh
```

Al primo avvio vedrai nel terminale:
1. Il caricamento del database delle carte da `forge-gui/res/cardsfolder/` (~35.000 carte).
2. L'indicizzazione automatica dei **1.475 mazzi predefiniti** (Commander, Preconstructed, Eventi).
3. Il messaggio:
   ```text
   =============================================================
     Lozzander Online — Web Server listening on port 8080
     API: http://localhost:8080/api/status
     WS:  ws://localhost:8080/ws
   =============================================================
   ```

Apri il browser su **`http://localhost:8080`**.

---

## 3. Come Giocare in Rete con Altri Giocatori

Per far entrare i tuoi amici nella stessa partita:
1. **In Rete Locale (LAN / Wi-Fi / VPN come Tailscale, ZeroTier, Hamachi)**:
   - Chi avvia il server condivide il proprio indirizzo IP locale o VPN sulla porta `8080` (es. `http://192.168.1.50:8080` o `http://100.x.y.z:8080`).
2. **Via Internet (Port Forwarding / Tunnel / VPS)**:
   - Puoi esporre la porta `8080` tramite un tunnel (es. `cloudflared tunnel --url http://localhost:8080` o `ngrok http 8080`) oppure eseguendo `./webapp/start-webapp.sh` su un server cloud/VPS.
3. Tutti i giocatori aprono lo stesso link nel browser, inseriscono l'**ID Stanza** e la **Password** scelti dall'Host ed entrano nella stessa partita.

---

## 4. Guida all'Uso: Lobby e Preparazione Partita

### 4.1 Creare o Entrare in una Stanza
Nella schermata iniziale (**Home**):
- **Crea Nuova Stanza**:
  1. Inserisci il tuo **Nome Giocatore**.
  2. Scegli un **ID Stanza** (es. `serata-commander`) o lascialo vuoto per generare un codice automatico di 6 caratteri.
  3. Imposta una **Password Stanza** (opzionale ma consigliata per riservare l'accesso).
  4. Scegli il **Formato**:
     - **Commander (EDH)** (punti vita iniziali a 40, regole di Identità di Colore, Zona di Comando, Commander Tax di `{2}` per lancio e Danno da Comandante a 21).
     - **Constructed** (punti vita a 20, qualsiasi mazzo da 60+ carte).
  5. Imposta il **Numero di Posti** (da **2 a 8 giocatori**).
- **Entra in una Stanza**:
  - Inserisci il tuo **Nome Giocatore**, l'**ID Stanza** (o clicca direttamente su una stanza dall'elenco **Stanze Attive sul Server**) e la **Password**.

> **Riconnessione Automatica**: Il browser salva un token di sessione (`sessionToken`). Se ricarichi la pagina (`F5`) o cade momentaneamente la connessione, rientri automaticamente al tuo posto e con le tue carte in mano sia in Lobby sia a partita in corso.

### 4.2 Gestione dei Posti (Slot) e Bot IA
Dentro la **Lobby Stanza**:
- Ogni giocatore può cliccare su **Siediti Qui** in uno slot libero, oppure l'Host può cliccare su **+ Aggiungi Bot IA** per riempire gli slot con l'intelligenza artificiale di Forge.
- È possibile cambiare **Squadra (Team)** per giocare Tutti-contro-Tutti (Free-for-All, un team diverso per ogni giocatore) oppure a Squadre (es. 2v2 o 3v3).

### 4.3 Scelta, Importazione o Costruzione del Mazzo
Clicca su **Scegli / Costruisci Mazzo** sul tuo slot per aprire il **Gestore Mazzi**, diviso in 4 schede:
1. **Catalogo Mazzi Predefiniti**:
   - Cerca e filtra tra i **184 mazzi Commander** e i **1.291 mazzi Precon/Constructed** inclusi in Forge.
2. **Importa Testo (.dck / Arena / MTGO)**:
   - Incolla qualsiasi lista in formato standard (`1 Sol Ring`, `1 Arcane Signet`, ecc.) con sezioni `[Commander]`, `[Main]`, `[Sideboard]`.
   - Clicca su **Verifica Mazzo** per controllare se tutte le carte sono riconosciute dal motore e poi su **Equipaggia Mazzo**.
3. **Deck Builder (Cerca Carte)**:
   - Cerca qualsiasi carta tra le oltre 35.000 presenti nel database per nome, tipo o testo Oracle.
   - Clicca **+ Main** per aggiungerla al mazzo o **👑 Cmd** per impostarla come tuo Comandante.
4. **Mazzo Casuale**:
   - Genera istantaneamente un mazzo casuale valido per il formato scelto (o per i colori selezionati).

Quando tutti i giocatori umani hanno selezionato il mazzo e cliccato su **Pronto**, il creatore della stanza clicca su **Avvia Partita**.

---

## 5. Guida al Tavolo da Gioco Interattivo

### 5.1 Barra Superiore: Fasi, Stop, Auto-Pass e Undo
Nella barra in alto trovi:
- **Indicatore Turno**: mostra il numero del turno e di chi è il turno attuale.
- **Striscia delle 13 Fasi / Sottofasi**:
  - `STAP` (Untap) · `MANT` (Upkeep) · `PESC` (Draw) · `MAIN 1` · `INIZ CMB` · `ATTACC` · `BLOCC` · `ATT IMPR` · `DANNO` · `FINE CMB` · `MAIN 2` · `FINE` (EOT) · `CANC` (Cleanup).
  - **Clicca su una fase** per attivare o disattivare lo **Stop automatico** (pallino luminoso = il gioco si ferma quando ricevi priorità in quella fase; spento = passa automaticamente).
- **Pulsanti Rapidi di Auto-Pass e Undo**:
  - **`Undo` (`Annulla`)**: annulla l'ultima azione effettuata (es. terra appena giocata, terra tappata per mana o lancio in corso). Si illumina d'oro quando un'azione è annullabile.
  - **`Passa fino a Fine Turno`**: cede automaticamente la priorità fino alla sottofase finale (`FINE`).
  - **`Cedi Pila`**: cede la priorità finché tutti gli oggetti attualmente sulla Pila non si sono risolti.
  - **`Auto se 0 Giocate`**: passa automaticamente la priorità quando non hai alcuna carta o abilità giocabile.
  - **`Stop Auto-Pass`**: interrompe qualsiasi cessione automatica attiva.

### 5.2 Scorciatoie da Tastiera
- **`Ctrl + Z`** (o `Cmd + Z`): **Undo / Annulla** l'ultima azione o annulla il pagamento mana/bersaglio in corso.
- **`Barra Spaziatrice`**: equivale a premere il pulsante verde **`OK / Passa`** (quando non stai scrivendo nella chat).

### 5.3 Come Giocare Carte, Attivare Abilità e Pagare il Mana
- **Bordo Verde / Oro sulle Carte**: quando hai la priorità (`⚡ TUA PRIORITÀ`), le carte in Mano, in Zona di Comando o sul Campo di Battaglia che puoi giocare o attivare sono evidenziate.
- **Clic Sinistro su una Carta**:
  - Gioca la terra, lancia la magia, attiva l'abilità del permanente, oppure seleziona la carta come bersaglio/costo quando richiesto dal prompt centrale.
  - Se una carta ha **più modalità o abilità** (es. terra doppia, planeswalker, charm o comandante con più opzioni), si apre automaticamente un modale per scegliere quale attivare.
- **Riserva di Mana (Mana Pool)**:
  - Quando hai mana flottante in riserva, compare nella tua barra stato (in basso). Durante il pagamento di un costo (`InputPayMana`), puoi tappare direttamente le terre sul campo oppure cliccare i simboli nella tua riserva di mana.

### 5.4 Combattimento (Attacco e Blocco)
1. **Dichiarazione Attaccanti (`ATTACC`)**:
   - Se ci sono più avversari (es. Commander multiplayer), clicca prima sul **Giocatore Avversario** (o sul suo Planeswalker) che vuoi attaccare, poi clicca sulle tue creature per mandarle all'attacco (o usa il pulsante **`Attacca con Tutto`** per un Alpha Strike).
   - Clicca su **`OK / Passa`** per confermare gli attaccanti.
2. **Dichiarazione Bloccanti (`BLOCC`)**:
   - Se sei il difensore, clicca prima sulla **tua creatura bloccante** e poi sulla **creatura attaccante** che vuoi bloccare, quindi conferma con **`OK / Passa`**.
3. **Assegnazione Danno da Combattimento**:
   - In caso di blocchi multipli o *Trample* (Travolgere), si apre automaticamente la finestra di distribuzione dei danni.

### 5.5 Funzioni Specifiche Commander (EDH)
- **Zona di Comando sempre visibile**: il tuo Comandante è accessibile direttamente nella sezione **Zona di Comando** a sinistra della tua mano (con un badge dorato `ZONA CMD`). Cliccalo per lanciarlo proprio come faresti con una carta in mano.
- **Tabella Commander (`👑 Cmd` nel pannello destro)**:
  - Mostra in tempo reale per ogni giocatore il **Comandante**, quante volte è stato lanciato e la **Tassa Comandante attuale (`+{2}` per lancio)**.
  - Mostra la **Matrice dei Danni da Comandante** (`X / 21`) subiti da ciascun Comandante avversario.

### 5.6 Pannello Laterale Destro (Info, Zone, Log e Chat)
Il pannello a destra offre 4 schede:
1. **`Info` (Ispettore Carta)**: passando il mouse o cliccando su qualsiasi carta (in campo, mano, pila o cimitero), vedi l'immagine ad alta risoluzione tramite **API Scryfall** (con pulsante **🔄 Gira** per le carte bifronte / DFC), il costo di mana, il testo Oracle completo con simboli colorati, Forza/Costituzione, segnalini e carte equipaggiate/incantate.
2. **`👑 Cmd`**: riepilogo Comandanti, Commander Tax e Danni da Comandante.
3. **`Zone`**: esploratore completo delle carte presenti in **Cimitero**, **Esilio**, **Zona di Comando** e carte giocabili da zone esterne (**Flashback / Foretell / Adventure**) di qualunque giocatore al tavolo (apribile anche cliccando direttamente i contatori `🪦 Cimitero` o `🌀 Esilio` sopra ogni giocatore).
4. **`Log`**: registro dettagliato delle azioni di gioco in tempo reale + **Chat del Tavolo** per scrivere agli altri giocatori.

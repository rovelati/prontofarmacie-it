# ProntoFarmacie.it 💊 — Portale Nazionale Farmacie di Turno e Aperte Adesso

[![Website](https://img.shields.io/badge/Website-prontofarmacie.it-10b981?style=for-the-badge&logo=googlechrome&logoColor=white)](https://www.prontofarmacie.it/)
[![Astro](https://img.shields.io/badge/Framework-Astro_4.x-BC52EE?style=for-the-badge&logo=astro&logoColor=white)](https://astro.build)
[![Tailwind CSS](https://img.shields.io/badge/Styling-Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/Database-Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
[![Leaflet](https://img.shields.io/badge/Maps-Leaflet-199900?style=for-the-badge&logo=leaflet&logoColor=white)](https://leafletjs.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)

[**ProntoFarmacie.it**](https://www.prontofarmacie.it/) è la piattaforma digitale di riferimento in Italia per individuare in tempo reale le **farmacie aperte adesso**, i **turni festivi e notturni**, la **guardia medica** e le farmacie di turno più vicine in tutte le 107 province e comuni italiani.

---

## 🌟 Funzionalità Principali

* 📍 **Farmacie Aperte Adesso e Vicino a Te**: Geolocalizzazione istantanea per trovare la farmacia più vicina aperta in questo momento.
* 🌙 **Turni Notturni e Festivi**: Consultazione in tempo reale dei calendari dei turni di guardia farmaceutica approvati dalle ASL e dagli Ordini dei Farmacisti.
* 🗺️ **Mappe Interattive & Navigazione**: Calcolo del percorso stradale, distanza chilometrica e navigazione diretta via Google Maps / Apple Maps.
* 📞 **Contatti Diretti & Reperibilità**: Numeri di telefono, orari di apertura ordinari e contatti di emergenza sempre aggiornati.
* 💼 **Bacheca Lavoro Farmacie**: Sezione dedicata agli annunci di lavoro per farmacisti collaboratori e direttori di farmacia.
* ⚡ **Performance Estrema**: Costruito su architettura ibrida Astro SSR + static generation per tempi di risposta inferiori a 100ms e Core Web Vitals ottimali.

---

## 🛠️ Stack Tecnologico

* **Frontend & SSR**: [Astro 4.x](https://astro.build/) con rendering ibrido e componenti [React 18](https://react.dev/).
* **Styling**: [Tailwind CSS](https://tailwindcss.com/) & [Radix UI](https://www.radix-ui.com/).
* **Database & Auth**: [Supabase](https://supabase.com/) (PostgreSQL con estensioni geospaziali).
* **Mappe & GIS**: [Leaflet.js](https://leafletjs.com/) con marker clustering per decine di migliaia di punti di interesse.
* **SEO & Indexing**: Dati strutturati Schema.org (`Pharmacy`, `MedicalBusiness`, `LocalBusiness`), Sitemap XML multilivello, IndexNow e protocollo Bing Webmaster.

---

## 🚀 Avvio Rapido

```bash
# Clona il repository
git clone https://github.com/rovelati/prontofarmacie-it.git
cd prontofarmacie-it

# Installa le dipendenze
npm install

# Avvia il server di sviluppo
npm run dev
```

---

## 🌐 Link Utili & Risorse Ufficiali

* 🌐 **Portale Ufficiale**: [https://www.prontofarmacie.it/](https://www.prontofarmacie.it/)
* 🕒 **Farmacie di Turno Oggi**: [https://www.prontofarmacie.it/farmacie-di-turno/](https://www.prontofarmacie.it/farmacie-di-turno/)
* 📍 **Farmacie Vicino a Me**: [https://www.prontofarmacie.it/farmacie-di-turno-vicino-a-te/](https://www.prontofarmacie.it/farmacie-di-turno-vicino-a-te/)
* 💼 **Lavoro in Farmacia**: [https://www.prontofarmacie.it/lavoro/](https://www.prontofarmacie.it/lavoro/)

---

## 📄 Licenza

Distribuito sotto licenza MIT. Consulta il file `LICENSE` per ulteriori dettagli.

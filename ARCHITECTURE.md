# MediMind Nexus - Documentation Technique

## 🎯 Vue d'ensemble

**MediMind Nexus** est une plateforme médicale intelligente intégrant l'IA pour l'analyse de données patients, la découverte d'interactions médicamenteuses et l'aide au diagnostic.

---

## 🛠️ Stack Technologique

### Frontend
| Technologie | Version | Rôle |
|------------|---------|------|
| **React** | 18.3.1 | Framework UI |
| **TypeScript** | 5.8.3 | Typage statique |
| **Vite** | 5.4.19 | Bundler/Dev server |
| **TailwindCSS** | 3.4.17 | Styling |
| **Shadcn/UI** | (Radix) | Composants UI |
| **React Router** | 6.30.1 | Routing |
| **React Query** | 5.83.0 | Data fetching |
| **i18next** | 25.7.2 | Internationalisation |
| **Recharts** | 2.15.4 | Graphiques |
| **XYFlow** | 12.10.0 | Graphes interactifs |
| **Three.js** | 0.158.0 | 3D visualisation |

### Backend
| Technologie | Rôle |
|------------|------|
| **Supabase** | BaaS (PostgreSQL + Auth + Storage) |
| **Deno Edge Functions** | Serverless functions |
| **Claude API** | IA (Anthropic) |
| **Firecrawl API** | Web scraping |

---

## 📁 Arborescence

```
medimind-nexus/
├── src/
│   ├── components/          # 140+ composants React
│   │   ├── cde/             # Continuous Discovery Engine
│   │   ├── ui/              # Shadcn/UI components
│   │   ├── layout/          # AppLayout, Sidebar, Header
│   │   ├── patient/         # PatientCard, PatientForm
│   │   └── ...
│   ├── pages/               # 12 pages principales
│   ├── hooks/               # 6 custom hooks
│   ├── contexts/            # TranslationContext
│   ├── integrations/        # Supabase client + types
│   ├── lib/                 # Utilitaires (cn, utils)
│   ├── i18n/                # Traductions FR/EN/DE
│   └── data/                # Fichiers CSV de seed
│
├── supabase/
│   ├── functions/           # 16 Edge Functions
│   └── migrations/          # 28 migrations SQL
│
├── public/                  # Assets statiques
└── scripts/                 # Scripts d'import
```

---

## 📄 Pages Principales

| Route | Fichier | Description |
|-------|---------|-------------|
| `/` | `Index.tsx` | Landing page |
| `/dashboard` | `Dashboard.tsx` | Tableau de bord principal |
| `/patients` | `Patients.tsx` | Liste des patients |
| `/patients/:id` | `PatientDetail.tsx` | Dossier patient + Chat IA |
| `/pathologies` | `Pathologies.tsx` | Catalogue pathologies |
| `/pathologies/:id` | `PathologyDetail.tsx` | Détail pathologie |
| `/search` | `Search.tsx` | Recherche symptômes/diagnostic |
| `/cross-data-analysis` | `CrossDataAnalysis.tsx` | Analyse croisée multi-patients |
| `/continuous-discovery` | `ContinuousDiscovery.tsx` | **CDE** - Découverte IA |
| `/admin` | `Admin.tsx` | Administration système |
| `/auth` | `Auth.tsx` | Connexion/Inscription |

---

## ⚡ Edge Functions (Supabase)

### Analyse IA
| Fonction | Description |
|----------|-------------|
| `ai-assistant` | Chat RAG avec contexte patient |
| `cde-analyze` | Analyse Knowledge Graph + Claude streaming |
| `cde-systematic-analyze` | Analyse combinatoire par paires |
| `cross-data-analyzer` | Analyse croisée multi-patients |
| `pathology-analyzer` | Analyse de pathologies |
| `patient-health-synthesis` | Synthèse santé patient |
| `deep-research` | Recherche approfondie PubMed |

### Import de données
| Fonction | Description |
|----------|-------------|
| `medical-scraper` | Scraping Compendium.ch via Firecrawl |
| `import-swissmedic` | Import catalogue Swissmedic |
| `import-openfda` | Import données FDA |
| `import-icd` | Import codes ICD-10 |
| `document-analyzer` | OCR + extraction documents patients |

### Utilitaires
| Fonction | Description |
|----------|-------------|
| `translate` | Traduction texte |
| `translate-database` | Traduction batch DB |
| `embed-data` | Génération embeddings vectoriels |
| `pubmed-search` | Recherche articles PubMed |

---

## 🗄️ Schéma Base de Données

### Tables Principales
```
patients              # Dossiers patients
├── patient_medications
├── patient_pathologies
├── patient_documents
├── patient_vaccinations
├── patient_medical_notes
└── patient_vital_signs

medications           # Catalogue médicaments
├── side_effects
├── drug_interactions
└── contraindications

pathologies           # Catalogue pathologies
├── symptoms
└── pathology_symptoms

treatments            # Traitements standards
```

### Tables CDE (Continuous Discovery Engine)
```
cde_nodes             # Nœuds du Knowledge Graph
cde_edges             # Arêtes/relations
discovery_cards       # Découvertes IA
cde_analysis_runs     # Runs d'analyse systématique
cde_pair_analyses     # Résultats par paire
```

---

## 🧠 Continuous Discovery Engine (CDE)

### Architecture
```
┌─────────────────────────────────────────────────────┐
│                  Frontend (React)                   │
│  ┌───────────────────────────────────────────────┐  │
│  │ ContinuousDiscovery.tsx                       │  │
│  │ - Tab Analyse Live (streaming Claude)         │  │
│  │ - Tab Découvertes (cards sauvegardées)        │  │
│  │ - Tab Knowledge Graph (visualisation)         │  │
│  │ - Tab Analyse Systématique (paires)           │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│              Supabase Edge Functions                │
│  ┌─────────────────┐  ┌──────────────────────────┐  │
│  │ cde-analyze     │  │ cde-systematic-analyze   │  │
│  │ (streaming)     │  │ (batch pairwise)         │  │
│  └─────────────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│                    Claude API                       │
│             (Opus 4.5 / Sonnet 4)                   │
└─────────────────────────────────────────────────────┘
```

### Workflow Analyse Systématique
```
1. Peupler KG    → seed_cde_knowledge_graph()
2. Démarrer      → POST /cde-systematic-analyze {action: "start"}
3. Analyser      → POST /cde-systematic-analyze {action: "analyze", substance_index: 0}
4. Répéter       → Pour chaque substance vs toutes les autres
5. Résultats     → cde_pair_analyses + discovery_cards
```

---

## 🔐 Authentification & RLS

- **Supabase Auth** avec email/password
- **Row Level Security (RLS)** sur toutes les tables
- **Rôles** : `admin`, `researcher`, `doctor`
- **Accès** : Chaque utilisateur voit ses patients uniquement

---

## 🌍 Internationalisation

| Langue | Fichier |
|--------|---------|
| 🇫🇷 Français | `src/i18n/locales/fr.json` |
| 🇬🇧 English | `src/i18n/locales/en.json` |
| 🇩🇪 Deutsch | `src/i18n/locales/de.json` |

---

## 🚀 Commandes

```bash
# Développement
npm run dev

# Build production
npm run build

# Déployer Edge Functions
npx supabase functions deploy <function-name>

# Appliquer migrations
npx supabase db push

# Import données
npm run import:data
```

---

## 📊 Variables d'Environnement

```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...

# Dans Supabase Dashboard (secrets)
CLAUDE_API_KEY=sk-ant-...
FIRECRAWL_API_KEY=fc-...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
```

---

## 📝 Dernière mise à jour

- **Date** : 2025-12-14
- **Version** : 1.0.0
- **Auteur** : MediMind Team

# Swim Lessons Discovery Platform

A multi-tenant, city-pluggable mobile-first platform for parents to discover and book kids' swim lessons.

## 🏊 Overview

This platform helps parents rapidly find age-appropriate swim lessons near them, with smart filtering by location, schedule, price, and more. The architecture treats each city as a tenant, enabling easy expansion to new cities via configuration (not code changes).

**Current Status:** Foundation complete, ready for Week 1 implementation

**Target:** NYC MVP launch in 8-12 weeks
**Budget:** <$200/month Azure costs
**Team:** 2-4 people

## 🏗️ Architecture

### City-as-Tenant Model
- Each city is a tenant with its own `CityConfig` (timezone, geographies, search profile, feature flags)
- `CityDataAdapter` interface abstracts city-specific data sources
- Canonical schema (Provider, Location, Program, Session) unifies data across cities
- Control plane manages tenant catalog and onboarding workflow

### Azure Services (Budget-Optimized)
- **Cosmos DB** (Serverless): $25-50/month at low traffic
- **Azure Static Web App** (Free tier): PWA frontend + CDN
- **Function Apps** (Consumption): Serverless API backend
- **App Configuration** (Free tier): Feature flags
- **Key Vault** (Standard): Secrets management (~$3/month)
- **Application Insights** (5GB free): Telemetry with 20% sampling

**Estimated Cost:** $40-60/month initially, scales to ~$150/month at 5K MAU

## 🚀 Quick Start

### Prerequisites
- Node.js 22
- Azure CLI
- Azure subscription
- Git

### 1. Clone & Install

\`\`\`bash
git clone https://github.com/berginj/SwimLessons
cd pools
npm install
\`\`\`

### 2. Deploy Azure Infrastructure

\`\`\`bash
# Login to Azure
az login

# Deploy infrastructure (dev environment)
cd infrastructure-as-code
./scripts/deploy.sh dev swim-lessons-dev-rg eastus

# Note the outputs (connection strings, URLs)
\`\`\`

### 3. Configure Environment

\`\`\`bash
# Create .env file (based on Bicep deployment outputs)
cat > .env <<EOF
COSMOS_CONNECTION_STRING=<from deployment output>
APP_CONFIG_ENDPOINT=<from deployment output>
KEY_VAULT_NAME=<from deployment output>
APPLICATIONINSIGHTS_CONNECTION_STRING=<from deployment output>
ENVIRONMENT=dev
EOF
\`\`\`

### 4. Build & Test

\`\`\`bash
# Build TypeScript
npm run build

# Run tests
npm test

# Lint code
npm run lint
\`\`\`

## 📁 Repository Structure

\`\`\`
pools/
├── src/
│   ├── core/
│   │   ├── contracts/          # CityConfig, ICityDataAdapter interfaces
│   │   ├── models/             # Canonical schema (Provider, Location, Program, Session)
│   │   └── errors/
│   ├── adapters/               # City-specific data adapters (NYC, LA, etc.)
│   ├── services/
│   │   ├── search/             # Search logic, ranking, no-results fallback
│   │   ├── transit/            # Travel time estimation
│   │   ├── control-plane/      # Tenant management, onboarding
│   │   ├── feature-flags/      # Azure App Configuration client
│   │   └── telemetry/          # Application Insights tracking
│   ├── infrastructure/
│   │   ├── cosmos/             # Cosmos DB client & repositories
│   │   ├── app-config/
│   │   └── key-vault/
│   ├── functions/              # Azure Functions (API endpoints)
│   │   ├── search-api/         # POST /api/search, GET /api/sessions/{id}
│   │   ├── admin-api/          # Provider CRUD, bulk upload
│   │   └── jobs/               # Data sync (timer-triggered)
│   └── web/                    # React PWA (Static Web App)
│
├── infrastructure-as-code/
│   ├── bicep/                  # Infrastructure as Code
│   │   ├── main.bicep
│   │   └── modules/            # Cosmos DB, Function Apps, etc.
│   └── scripts/
│       └── deploy.sh
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
└── docs/
    ├── architecture/
    └── runbooks/
\`\`\`

## 📋 Week 1 Tasks (Foundation)

### Data Research (Priority 1)
- [ ] Investigate NYC Parks Department API
- [ ] Check NYC Open Data Portal for pools/recreation data
- [ ] Identify top 10 swim providers (YMCA, JCC, private schools)
- [ ] Assess data quality, API availability
- [ ] Document findings in `docs/data-research-nyc.md`

### Infrastructure (Done ✅)
- [x] Bicep templates created
- [x] Core contracts defined (CityConfig, ICityDataAdapter, canonical schema)
- [x] Repository structure set up
- [ ] Deploy to Azure dev environment
- [ ] Verify Cosmos DB, Function Apps, Static Web App

### Repository Setup (Done ✅)
- [x] TypeScript, ESLint, Prettier configured
- [x] Git repository initialized
- [x] GitHub Actions CI prepared
- [ ] Run initial deployment

## 🎯 MVP Scope (NYC Only)

**In Scope:**
- Search with filters (age, date, days, time, neighborhood, price)
- Session details page
- Click-out to provider signup URL (not native checkout)
- Admin CSV upload + manual CRUD
- Instrumentation (funnel tracking, search quality)
- Basic geolocation (optional)

**Out of Scope (V1+):**
- User accounts, saved searches
- Native checkout (Stripe integration)
- Reviews, ratings
- Email notifications
- Multi-city support

**Success Metrics:**
- 100 MAU (monthly active users)
- >8% search → signup click rate
- <10% no-results rate
- <500ms p95 search latency
- <$200/month Azure costs

## 🛠️ Development

### Build Commands

\`\`\`bash
npm run build              # Compile TypeScript
npm run build:watch        # Watch mode
npm run lint               # Check code style
npm run lint:fix           # Auto-fix linting issues
npm run format             # Format code with Prettier
npm test                   # Run unit tests
npm run test:watch         # Watch mode
npm run test:integration   # Integration tests
npm run test:e2e           # End-to-end tests (Playwright)
\`\`\`

### Deployment

\`\`\`bash
npm run deploy:infra       # Deploy Azure infrastructure (Bicep)
npm run deploy:functions   # Deploy Function Apps
npm run deploy:web         # Deploy Static Web App
\`\`\`

## 📖 Key Concepts

### City Module Contract
Every city implements:
1. **CityConfig** - Timezone, geographies, transit modes, search profile, feature flags
2. **CityDataAdapter** - `getLocations()`, `getPrograms()`, `getSessions()`, `syncData()`
3. **Search Profile** - Ranking weights, no-results fallback strategy

### Data Flow
1. NYC Adapter fetches data from NYC Parks API (or CSV)
2. Transform to canonical schema (Provider, Location, Program, Session)
3. Store in Cosmos DB (`sessions` container, partitioned by `cityId`)
4. Search API queries Cosmos DB → scores/ranks results → returns to frontend
5. User clicks "Sign Up" → redirected to provider's booking page

### Cost Optimization
- Cosmos DB serverless (no minimum RU/s)
- Static Web App free tier (100GB bandwidth)
- Function Apps consumption plan (pay-per-execution)
- App Configuration free tier (1K requests/day)
- Application Insights sampling (20%)
- 90-day TTL on telemetry events

## 📚 Documentation

- **Architecture Plan**: `.claude/plans/clever-munching-pascal.md` (comprehensive 12-week roadmap)
- **Contracts**: `src/core/contracts/` (CityConfig, ICityDataAdapter)
- **Data Models**: `src/core/models/canonical-schema.ts`
- **Bicep Modules**: `infrastructure-as-code/bicep/modules/`

## 🤝 Contributing

This is a private project for the MVP phase. After launch, we'll open-source the city adapter framework.

### Coding Standards
- TypeScript strict mode enabled
- ESLint + Prettier enforced
- 100% test coverage for adapters and services (goal)
- No `any` types (use `unknown` and type guards)

### Commit Convention
\`\`\`
feat: Add NYC Parks adapter
fix: Correct session age filtering
docs: Update README with deployment steps
chore: Update dependencies
\`\`\`

## 🐛 Troubleshooting

### Deployment Issues
- **Bicep validation errors**: Check Azure CLI version (`az upgrade`)
- **Cosmos DB quota**: Serverless has 1M RU/s max per account
- **Function App cold start**: First request may be slow (<5s)

### Development Issues
- **TypeScript errors**: Run `npm run build` to see detailed errors
- **Import path errors**: Check `tsconfig.json` path mappings

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/berginj/SwimLessons/issues)
- **Team**: Weekly standup Mondays 10am

## 📄 License

MIT License - see LICENSE file

---

**Status**: Foundation complete, ready for Week 1 data research and NYC adapter implementation.

**Next Steps**:
1. Complete NYC data research (Week 1, Day 1-2)
2. Deploy infrastructure to Azure dev environment
3. Implement NYC adapter based on findings
4. Build search service and API (Week 4-5)
5. Create React PWA frontend (Week 6-7)
6. Launch pilot with 20-30 beta users (Week 11)
7. Public NYC launch (Week 12)

# 🧭 HERMES Agent Configuration - Compass (NSGC)

This file instructs Hermes / OpenCode agents on how to execute tasks autonomously in this repository.

## 🏗️ Project Architecture & Stack
- **Monorepo**: Located inside `k0mp4ss_fe/` (Turborepo).
- **Frontend App**: `k0mp4ss_fe/apps/web/` (Next.js 14+ App Router, TypeScript, Tailwind CSS).
- **UI Components**: `k0mp4ss_fe/packages/ui/` (shadcn/ui component library).
- **Data & Mocks**: `k0mp4ss_fe/apps/web/data/` (TypeScript typed mock models).

## 📚 Documentation & Specifications
- **Root Documentation**: `docs/` (refer to `docs/00-index.md` for index).
- **System Specs**: `Data/NSGC/docs/manuales/`.
- **Active OpenSpec Changes**: `openspec/changes/`.

## 🔄 Autonomous Execution Protocol (OpenSpec Workflow)
1. **Identify Tasks**: Inspect `openspec/changes/<active-change>/tasks.md`.
2. **Read Contracts & Specs**: Read relevant specifications in `docs/` (e.g. `docs/05 - CRUD Vinculacion de Unidades.md` and `docs/06 - Interfaces TypeScript FormularioVinculoUnidad.md`).
3. **Implement Code**: Edit files inside `k0mp4ss_fe/apps/web/` and `packages/ui/`.
4. **Validation**: Check for TypeScript errors or missing imports.
5. **Mark Progress**: Update `tasks.md` by changing `- [ ]` to `- [x]` as tasks are completed.
6. **Documentation Rule**: If generating `.md` files in `docs/`, write in Chilean Spanish and maintain `00-index.md` with notation `AA - Herramienta.md`.

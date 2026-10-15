import type { Module } from '../data/modules.ts'
import ChemicalStructure from '../modules/chemistry/ChemicalStructure.tsx'
import ExperimentData from '../modules/experiment/ExperimentData.tsx'
import MolecularVisualization from '../modules/molviz/MolecularVisualization.tsx'
import ScientificData from '../modules/data/ScientificData.tsx'
import ProteinStructure from '../modules/protein/ProteinStructure.tsx'
import SequenceAnalysis from '../modules/sequence/SequenceAnalysis.tsx'
import ProjectsFiles from '../modules/projects/ProjectsFiles.tsx'
import type { ProjectItem } from '../services/projectStore.ts'

interface ModuleWorkspaceProps {
  module: Module
  onBack: () => void
  initial?: ProjectItem | null
  onOpenItem?: (item: ProjectItem) => void
}

function ModuleWorkspace({ module, onBack, initial = null, onOpenItem }: ModuleWorkspaceProps) {
  return (
    <section className="workspace">
      <div className="workspace-bar">
        <button className="back-button" onClick={onBack}>
          ← All modules
        </button>

        <div className="workspace-title">
          <span className="workspace-icon">{module.icon}</span>
          <div>
            <span className="workspace-label">MODULE</span>
            <h2>{module.title}</h2>
          </div>
        </div>
      </div>

      <p className="workspace-description">{module.description}</p>

      <div className="workspace-body">
        {module.title === 'Protein Structure' ? (
          <ProteinStructure initial={initial} />
        ) : module.title === 'DNA / RNA Sequence' ? (
          <SequenceAnalysis initial={initial} />
        ) : module.title === 'Chemical Structure' ? (
          <ChemicalStructure initial={initial} />
        ) : module.title === 'Molecular Visualization' ? (
          <MolecularVisualization initial={initial} />
        ) : module.title === 'Scientific Data' ? (
          <ScientificData initial={initial} />
        ) : module.title === 'Experiment Data' ? (
          <ExperimentData initial={initial} />
        ) : module.title === 'Projects / Files' ? (
          <ProjectsFiles onOpen={(i) => onOpenItem?.(i)} />
        ) : (
          <>
            <div className="workspace-viewer">
              <div className="viewer-empty">
                <span className="viewer-icon">{module.icon}</span>
                <h3>{module.title} workspace</h3>
                <p>The {module.title.toLowerCase()} tool will appear here.</p>
              </div>
            </div>

            <aside className="workspace-side">
              <h4>Details</h4>
              <p>Nothing loaded yet. Inputs and results for this module will be listed here.</p>
            </aside>
          </>
        )}
      </div>
    </section>
  )
}

export default ModuleWorkspace

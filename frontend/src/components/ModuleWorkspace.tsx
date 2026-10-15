import type { Module } from '../data/modules.ts'
import ChemicalStructure from '../modules/chemistry/ChemicalStructure.tsx'
import MolecularVisualization from '../modules/molviz/MolecularVisualization.tsx'
import ScientificData from '../modules/data/ScientificData.tsx'
import ProteinStructure from '../modules/protein/ProteinStructure.tsx'
import SequenceAnalysis from '../modules/sequence/SequenceAnalysis.tsx'

interface ModuleWorkspaceProps {
  module: Module
  onBack: () => void
}

function ModuleWorkspace({ module, onBack }: ModuleWorkspaceProps) {
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
          <ProteinStructure />
        ) : module.title === 'DNA / RNA Sequence' ? (
          <SequenceAnalysis />
        ) : module.title === 'Chemical Structure' ? (
          <ChemicalStructure />
        ) : module.title === 'Molecular Visualization' ? (
          <MolecularVisualization />
        ) : module.title === 'Scientific Data' ? (
          <ScientificData />
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

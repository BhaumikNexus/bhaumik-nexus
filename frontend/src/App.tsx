import { useState } from 'react'
import './App.css'
import { modules } from './data/modules.ts'
import ModuleWorkspace from './components/ModuleWorkspace.tsx'

function App() {
  const [selectedModule, setSelectedModule] = useState<string | null>(null)

  const activeModule = modules.find((m) => m.title === selectedModule) ?? null

  return (
    <div className="app">
      <header className="header">
        <button className="brand" onClick={() => setSelectedModule(null)}>
          <div className="brand-mark">BN</div>

          <div className="brand-text">
            <h1>Bhaumik Nexus</h1>
            <p>Scientific Visualization & Molecular Intelligence Platform</p>
          </div>
        </button>

        <button className="header-button">
          Get Started
        </button>
      </header>

      <main>
        {activeModule ? (
          <ModuleWorkspace
            module={activeModule}
            onBack={() => setSelectedModule(null)}
          />
        ) : (
          <>
            <section className="hero">
              <div className="hero-content">
                <span className="badge">SCIENTIFIC COMPUTING PLATFORM</span>

                <h2>
                  Explore Biology.
                  <br />
                  <span>Visualize Science.</span>
                </h2>

                <p>
                  Bhaumik Nexus is a scientific platform designed to bring
                  molecular structures, biological sequences, chemical data,
                  visualization and AI-assisted analysis into one workspace.
                </p>

                <div className="hero-actions">
                  <button
                    className="primary-button"
                    onClick={() =>
                      document
                        .getElementById('modules')
                        ?.scrollIntoView({ behavior: 'smooth' })
                    }
                  >
                    Explore Modules
                  </button>

                  <button className="secondary-button">
                    Open Project
                  </button>
                </div>
              </div>

              <div className="hero-visual">
                <div className="molecule">
                  <div className="orb orb-1"></div>
                  <div className="orb orb-2"></div>
                  <div className="orb orb-3"></div>
                  <div className="orb orb-4"></div>
                  <div className="core">BN</div>
                </div>
              </div>
            </section>

            <section className="modules" id="modules">
              <div className="section-heading">
                <div>
                  <span>WORKSPACE</span>
                  <h3>Scientific Modules</h3>
                </div>

                <p>
                  Select a module to begin exploring scientific data.
                </p>
              </div>

              <div className="module-grid">
                {modules.map((module) => (
                  <button
                    className="module-card"
                    key={module.title}
                    onClick={() => setSelectedModule(module.title)}
                  >
                    <div className="module-icon">
                      {module.icon}
                    </div>

                    <div className="module-content">
                      <h4>{module.title}</h4>
                      <p>{module.description}</p>
                    </div>

                    <div className="arrow">→</div>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
      </main>

      <footer>
        <span>© 2026 Bhaumik Nexus</span>
        <span>Scientific Visualization Platform</span>
      </footer>
    </div>
  )
}

export default App

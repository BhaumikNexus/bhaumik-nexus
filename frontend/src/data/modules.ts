export interface Module {
  icon: string
  title: string
  description: string
}

export const modules: Module[] = [
  {
    icon: "🧬",
    title: "Protein Structure",
    description: "Explore and visualize protein structures, domains and molecular components.",
  },
  {
    icon: "🧪",
    title: "Chemical Structure",
    description: "View and work with chemical structures, compounds and molecular representations.",
  },
  {
    icon: "🧬",
    title: "DNA / RNA Sequence",
    description: "Analyze DNA and RNA sequences with biological sequence visualization tools.",
  },
  {
    icon: "🔬",
    title: "Molecular Visualization",
    description: "Interact with 3D molecular structures and inspect individual components.",
  },
  {
    icon: "📊",
    title: "Scientific Data",
    description: "Visualize and interpret raw scientific datasets and experimental information.",
  },
  {
    icon: "🧫",
    title: "Experiment Data",
    description: "Enter replicate measurements and get SD, SEM, confidence intervals, t-tests, ANOVA and standard curves in one click.",
  },
  {
    icon: "🤖",
    title: "AI Analysis",
    description: "Use AI-assisted tools to analyze biological and molecular information.",
  },
  {
    icon: "🧩",
    title: "Simulation",
    description: "Run molecular and scientific simulations. Advanced simulation tools will be added later.",
  },
  {
    icon: "📁",
    title: "Projects / Files",
    description: "Organize structures, sequences, datasets and research projects in one place.",
  },
]

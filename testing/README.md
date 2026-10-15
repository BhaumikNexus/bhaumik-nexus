# Scientific validation tests

Checks for the calculation code (sequence analysis, chemistry helpers, data statistics) against hand-worked and published values,
for example the Anscombe quartet I correlation, the NCBI genetic code tables and known ORF positions.

Run from the repo root (needs Node 22.6 or newer; Node 24 strips the TypeScript types by default):

    node testing/scientific-validation/run-all.ts

Each file prints `ok` or `FAIL` per check and a summary line. The process exits with an error code if anything fails.

Not covered here: anything that needs RDKit, 3Dmol.js, RCSB or PubChem (those run in the browser and need internet).

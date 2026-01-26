import recipes from '../data/recipes.json';

/**
 * Berechnet rekursiv die benötigten Maschinen und Rohstoffe für ein Zielitem.
 *
 * @param {string} targetItem - Die ID des Zielitems (z.B. "iron-plate")
 * @param {number} targetAmountPerMin - Gewünschte Produktionsmenge pro Minute
 * @returns {Object} - Objekt mit machines (benötigte Maschinen) und rawResources (Rohstoffe)
 */
export function calculateRequirements(targetItem, targetAmountPerMin) {
  const machines = {};
  const rawResources = {};

  function calculate(itemId, amountPerMin) {
    const recipe = recipes[itemId];

    // Wenn kein Rezept existiert, ist es ein Rohstoff
    if (!recipe) {
      rawResources[itemId] = (rawResources[itemId] || 0) + amountPerMin;
      return;
    }

    // Berechne Output pro Minute für dieses Rezept
    const outputPerCycle = recipe.outputs[itemId];
    const cyclesPerMin = 60 / recipe.time;
    const outputPerMinPerMachine = outputPerCycle * cyclesPerMin;

    // Berechne benötigte Maschinen
    const machinesNeeded = amountPerMin / outputPerMinPerMachine;

    // Addiere Maschinen zum Ergebnis
    const machineKey = `${recipe.machine} (${recipe.name})`;
    machines[machineKey] = (machines[machineKey] || 0) + machinesNeeded;

    // Berechne rekursiv die benötigten Inputs
    for (const [inputId, inputAmount] of Object.entries(recipe.inputs)) {
      const inputPerCycle = inputAmount;
      const inputPerMinPerMachine = inputPerCycle * cyclesPerMin;
      const totalInputPerMin = inputPerMinPerMachine * machinesNeeded;

      calculate(inputId, totalInputPerMin);
    }
  }

  calculate(targetItem, targetAmountPerMin);

  return {
    machines,
    rawResources,
    summary: formatSummary(machines, rawResources)
  };
}

/**
 * Formatiert eine lesbare Zusammenfassung der Berechnungsergebnisse.
 */
function formatSummary(machines, rawResources) {
  let summary = '=== Benötigte Maschinen ===\n';
  for (const [machine, count] of Object.entries(machines)) {
    summary += `${machine}: ${count.toFixed(2)}\n`;
  }

  summary += '\n=== Benötigte Rohstoffe (pro Minute) ===\n';
  for (const [resource, amount] of Object.entries(rawResources)) {
    summary += `${resource}: ${amount.toFixed(2)}/min\n`;
  }

  return summary;
}

/**
 * Hilfsfunktion um alle verfügbaren Rezepte zu erhalten.
 */
export function getAvailableRecipes() {
  return Object.keys(recipes);
}

/**
 * Hilfsfunktion um ein spezifisches Rezept zu erhalten.
 */
export function getRecipe(itemId) {
  return recipes[itemId] || null;
}

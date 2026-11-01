// Kitchen mode's pure helpers: amount scaling and timer parsing.
// Run: npm test  (node --test, no dependencies)
import test from 'node:test';
import assert from 'node:assert/strict';
import { scaleText, splitQuantity, parseTimers, formatClock, formatAmount } from '../recipes/kitchen.js';

test('1x leaves every line untouched', () => {
  for (const s of ['345g chicken breast tenderloins', 'Salt to taste', '2 large eggs (about 100g)']) {
    assert.equal(scaleText(s, 1), s);
  }
});

test('scales grams and millilitres', () => {
  assert.equal(scaleText('345g chicken breast tenderloins', 2), '690g chicken breast tenderloins');
  assert.equal(scaleText('1000ml water', 3), '3000ml water');
  assert.equal(scaleText('236ml skim milk', 2), '472ml skim milk');
});

test('keeps decimals exact and drops a trailing .0', () => {
  assert.equal(scaleText('0.5g cayenne', 2), '1g cayenne');
  assert.equal(scaleText('0.5g cayenne', 3), '1.5g cayenne');
  assert.equal(scaleText('4.5g Morton\'s coarse kosher salt', 3), '13.5g Morton\'s coarse kosher salt');
  assert.equal(formatAmount(13.499999), '13.5');
});

test('scales both ends of a range', () => {
  assert.equal(scaleText('150-200g sausage', 2), '300-400g sausage');
  assert.equal(scaleText('1-2g red pepper flakes', 3), '3-6g red pepper flakes');
  assert.equal(scaleText('350-400g asparagus, trimmed', 2), '700-800g asparagus, trimmed');
});

test('scales amounts inside the line, not just the first', () => {
  assert.equal(
    scaleText('330g hot chicken bouillon (8g Better Than Bouillon in 330g water)', 2),
    '660g hot chicken bouillon (16g Better Than Bouillon in 660g water)');
  assert.equal(scaleText('About 500ml neutral oil for frying', 2), 'About 1000ml neutral oil for frying');
});

test('scales a leading count with its weight', () => {
  assert.equal(scaleText('2 large eggs (about 100g)', 3), '6 large eggs (about 300g)');
  assert.equal(scaleText('1 egg (~50g)', 2), '2 egg (~100g)');
  assert.equal(scaleText('1 pie crust, blind baked', 2), '2 pie crust, blind baked');
});

test('leaves words that merely start with g alone', () => {
  assert.equal(scaleText('6g garlic, minced', 2), '12g garlic, minced');
  assert.equal(scaleText('2 garlic cloves', 2), '4 garlic cloves');
  assert.equal(scaleText('Black pepper to taste', 3), 'Black pepper to taste');
});

test('splitQuantity separates the amount column', () => {
  assert.deepEqual(splitQuantity('345g chicken breast tenderloins'), { qty: '345g', name: 'chicken breast tenderloins' });
  assert.deepEqual(splitQuantity('1-2g red pepper flakes'), { qty: '1-2g', name: 'red pepper flakes' });
  assert.deepEqual(splitQuantity('2 large eggs (about 100g)'), { qty: '2', name: 'large eggs (about 100g)' });
  assert.deepEqual(splitQuantity('Salt to taste'), { qty: '', name: 'Salt to taste' });
  assert.deepEqual(splitQuantity('About 500ml neutral oil'), { qty: '', name: 'About 500ml neutral oil' });
});

test('finds a plain time', () => {
  assert.deepEqual(parseTimers('Pancetta into a cold skillet, medium-low. 8 minutes, until crisp.'),
    [{ seconds: 480, text: '8 minutes' }]);
  assert.deepEqual(parseTimers('Pressure cook on high for 5 minutes.').map((t) => t.seconds), [300]);
  assert.deepEqual(parseTimers('Melt butter, cook garlic 1 minute.').map((t) => t.seconds), [60]);
});

test('a range starts at its low end', () => {
  assert.deepEqual(parseTimers('Sear in the pancetta fat, 2 to 3 minutes per side.').map((t) => t.seconds), [120]);
  assert.deepEqual(parseTimers('Bake 35-45 minutes until edges are set.').map((t) => t.seconds), [2100]);
  assert.deepEqual(parseTimers('Add seasonings, simmer 5-10 min.').map((t) => t.seconds), [300]);
});

test('finds every time in a step, in order, across units', () => {
  assert.deepEqual(
    parseTimers('Bake 5 minutes at 400°F / 205°C, then reduce to 350°F / 175°C and bake 18-22 minutes more.').map((t) => t.seconds),
    [300, 1080]);
  assert.deepEqual(parseTimers('Brine tenders 2-4 hours (breasts 6-8 hours).').map((t) => t.seconds), [7200, 21600]);
  assert.deepEqual(parseTimers('Add garlic, cook 30 seconds.').map((t) => t.seconds), [30]);
});

test('ignores temperatures, weights and counts', () => {
  assert.deepEqual(parseTimers('Heat oil to 350°F / 175°C.'), []);
  assert.deepEqual(parseTimers('Roll into balls, about 30-35g each (makes ~14-16 meatballs).'), []);
  assert.deepEqual(parseTimers('Taste and adjust seasoning.'), []);
});

test('formatClock', () => {
  assert.equal(formatClock(480), '8:00');
  assert.equal(formatClock(59.6), '1:00');
  assert.equal(formatClock(7200), '2:00:00');
  assert.equal(formatClock(3725), '1:02:05');
  assert.equal(formatClock(-3), '0:00');
});

import * as assert from 'node:assert';
import { MoleculeCatalog } from '../src/atlas/catalog/molecule_catalog';

suite('Molecule catalog', () => {
	const catalog = new MoleculeCatalog();
	const energy = { translational_energy: 1e-21, rotational_energy: 0, vibrational_energy: 0 };

	test('every preset has traceable sources and physical SI parameters', () => {
		const sources = new Set(catalog.get_sources().map(source => source.id));
		const presets = catalog.list();
		assert.strictEqual(new Set(presets.map(preset => preset.id)).size, presets.length);
		for (const preset of presets) {
			assert.ok(sources.has(preset.source_id), preset.id);
			assert.ok(preset.mass > 1e-28 && preset.mass < 1e-24, preset.id);
			assert.ok(preset.reference_diameter > 1e-11 && preset.reference_diameter < 1e-8, preset.id);
			assert.ok(preset.reference_temperature > 0, preset.id);
			assert.ok(preset.viscosity_index >= 0.5 && preset.viscosity_index < 2.5, preset.id);
			assert.ok(preset.scattering_parameter >= 1, preset.id);
			if (preset.collision_model === 'vhs') {
				assert.strictEqual(preset.scattering_parameter, 1);
			}
			if (preset.temperature_range_k) {
				assert.strictEqual(preset.temperature_range_k.length, 2);
				assert.ok(preset.temperature_range_k[0] > 0);
				assert.ok(preset.temperature_range_k[1] > preset.temperature_range_k[0]);
			}
		}
	});

	test('preserves distinct VHS and VSS fits', () => {
		assert.strictEqual(catalog.get_preset('ar-sparta-argon-vhs').reference_diameter, 3.657897e-10);
		assert.strictEqual(catalog.get_preset('ar-sparta-argon-vss').reference_diameter, 4.11e-10);
		assert.strictEqual(catalog.get_preset('ar-sparta-argon-vss').scattering_parameter, 1.4);
		assert.strictEqual(catalog.get_preset('h2-piclas-reference-vhs').viscosity_index, 0.907);
		const fitted = catalog.get_preset('n2-weaver-2015-vss');
		assert.strictEqual(fitted.reference_diameter, 3.8705e-10);
		assert.strictEqual(fitted.reference_temperature, 353.15);
		assert.deepStrictEqual(fitted.temperature_range_k, [50, 2200]);
	});

	test('filters by species, model and case-insensitive text without inventing fits', () => {
		const nitrogen = catalog.list({ species: 'N2', collision_model: 'vss', text: 'NITROGEN' });
		assert.ok(nitrogen.length > 0);
		assert.ok(nitrogen.every(preset => preset.species === 'N2' && preset.collision_model === 'vss'));
		assert.deepStrictEqual(catalog.list({ species: 'CH4', collision_model: 'vss' }), []);
		assert.throws(() => catalog.get_preset('missing'), /Unknown molecule preset/);
	});

	test('creates editable engine materials with an explicit solver model and caller energies', () => {
		for (const model of ['vhs', 'vss'] as const) {
			const result = catalog.create_materials([{ preset_id: `ar-sparta-argon-${model}`, energy }]);
			assert.strictEqual(result.collision_model, model);
			assert.strictEqual(result.materials[0].translational_energy, energy.translational_energy);
			result.materials[0].mass = 1;
			assert.strictEqual(catalog.get_preset(`ar-sparta-argon-${model}`).mass, 6.63e-26);
		}
		const copy = catalog.get_preset('n2-weaver-2015-vss');
		copy.temperature_range_k![0] = 0;
		assert.deepStrictEqual(catalog.get_preset(copy.id).temperature_range_k, [50, 2200]);
	});

	test('rejects mixed solver models and invalid initial energy', () => {
		assert.throws(() => catalog.create_materials([]), /at least one/);
		assert.throws(() => catalog.create_materials([
			{ preset_id: 'ar-sparta-argon-vhs', energy },
			{ preset_id: 'n2-sparta-air-vss', energy }
		]), /same collision model/);
		for (const value of [-1, NaN, Infinity]) {
			assert.throws(() => catalog.create_materials([
				{ preset_id: 'ar-sparta-argon-vhs', energy: { ...energy, rotational_energy: value } }
			]), /nonnegative joules/);
		}
	});
});

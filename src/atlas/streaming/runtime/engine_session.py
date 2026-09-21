import copy
import math
import numpy as np
from atlas import DsmcKernelType, DsmcSolver, Float3, Fluid, MaterialDictionary, Molecule, System, Universe

from .engine_scene import EngineScene


class EngineSession:
    def __init__(self):
        self.system = None
        self.initial_config = None
        self.scene = None

    def initialize(self, config):
        if not isinstance(config, dict):
            raise ValueError("Simulation configuration must be an object.")
        collision_model = config.get("collision_model", "vhs")
        if collision_model not in ("vhs", "vss"):
            raise ValueError("collision_model must be 'vhs' or 'vss'.")
        kernel_type = (
            DsmcKernelType.variable_hard_sphere if collision_model == "vhs"
            else DsmcKernelType.variable_soft_sphere
        )
        dt = self._number(config.get("dt"), "dt", positive=True)
        weight = self._number(config.get("statistical_weight"), "statistical_weight", positive=True)
        material_configs = config.get("materials")
        if not isinstance(material_configs, list) or not material_configs:
            raise ValueError("materials must contain at least one molecule.")
        fields = (
            "mass", "translational_energy", "rotational_energy", "vibrational_energy",
            "reference_diameter", "reference_temperature", "viscosity_index", "scattering_parameter",
        )
        positive_fields = {"mass", "reference_diameter", "reference_temperature", "scattering_parameter"}
        materials = []
        for index, material in enumerate(material_configs):
            if not isinstance(material, dict):
                raise ValueError(f"materials[{index}] must be an object.")
            materials.append({
                field: self._number(material.get(field), f"materials[{index}].{field}", field in positive_fields)
                for field in fields
            })

        domain = config.get("domain")
        if not isinstance(domain, dict):
            raise ValueError("domain must be an object.")
        lower = self._vector(domain.get("lower_corner"), "domain.lower_corner")
        upper = self._vector(domain.get("upper_corner"), "domain.upper_corner")
        cell_size = self._number(domain.get("cell_size"), "domain.cell_size", positive=True)
        if not np.all(upper > lower):
            raise ValueError("domain.upper_corner must exceed lower_corner on every axis.")
        with np.errstate(over="ignore", invalid="ignore", divide="ignore", under="ignore"):
            inverse = np.float32(1.0) / np.float32(cell_size)
            volume = np.float32(cell_size) * np.float32(cell_size) * np.float32(cell_size)
            grid = np.floor((upper - lower) * inverse)
        if not np.isfinite(inverse) or not np.isfinite(volume) or volume <= 0:
            raise ValueError("domain.cell_size cannot form a finite positive float32 cell volume and reciprocal.")
        if not np.all(np.isfinite(grid)) or np.any(grid < 0) or np.any(grid >= 2_147_483_647):
            raise ValueError("domain grid dimensions exceed the engine's integer range.")
        if math.prod(int(axis) + 1 for axis in grid) > 2_147_483_647:
            raise ValueError("domain cell count exceeds the engine's integer range.")

        particles = self._particles(config.get("particles"), len(materials))
        self._check_positions(particles["positions"], lower, cell_size)
        capacity = self._integer(config.get("buffer_size", max(1, len(particles["positions"]))), "buffer_size", 1)
        if capacity < len(particles["positions"]):
            raise ValueError("buffer_size cannot be smaller than the initial particle count.")
        solver = config.get("solver", {})
        if not isinstance(solver, dict):
            raise ValueError("solver must be an object.")
        sample_pairs = self._integer(solver.get("majorant_sample_pairs", 8), "majorant_sample_pairs", 1)
        exhaustive_limit = self._integer(solver.get("majorant_exhaustive_limit", 5), "majorant_exhaustive_limit", 2)
        scene_config = config.get("scene")
        if isinstance(scene_config, dict) and scene_config.get("sources") and "buffer_size" not in config:
            raise ValueError("Set buffer_size to reserve particle capacity for sources.")
        initial_config = copy.deepcopy(config)
        table = MaterialDictionary([Molecule(**material) for material in materials])
        scene = EngineScene(self._number, self._vector)
        try:
            scene_arguments = scene.build(scene_config, table, len(materials))
            scene_arguments.setdefault("sinks", []).extend(scene.domain_sinks(lower, upper))
            fluid = Fluid.from_arrays(
                particles["positions"], particles["velocities"],
                statistical_weight=weight, materials=table, species=particles["species"], buffer_size=capacity,
            )
            universe = Universe(Float3(*lower.tolist()), Float3(*upper.tolist()), cell_size=cell_size)
            candidate = System(
                fluid=fluid, universe=universe, dt=dt,
                solver=DsmcSolver(kernel_type=kernel_type, majorant_sample_pairs=sample_pairs,
                                  majorant_exhaustive_limit=exhaustive_limit),
                **scene_arguments,
            )
            result = self._snapshot(candidate)
        except Exception:
            scene.close()
            raise
        self.system = candidate
        self.initial_config = initial_config
        if self.scene is not None:
            self.scene.close()
        self.scene = scene
        return result

    def snapshot(self):
        return self._snapshot(self._require_system())

    def step(self, params):
        if not isinstance(params, dict):
            raise ValueError("step parameters must be an object containing count.")
        count = params.get("count")
        if type(count) is not int or not 1 <= count <= 1000:
            raise ValueError("step count must be an integer from 1 to 1000.")
        system = self._require_system()
        lower = np.array([system.lower_corner.x, system.lower_corner.y, system.lower_corner.z], dtype=np.float32)
        for _ in range(count):
            self._check_positions(system.positions(), lower, system.cell_size)
            system.update()
        return self._snapshot(system)

    def set_particles(self, params):
        system = self._require_system()
        particles = self._particles(params, len(system.materials), system.particle_count)
        lower = np.array([system.lower_corner.x, system.lower_corner.y, system.lower_corner.z], dtype=np.float32)
        self._check_positions(particles["positions"], lower, system.cell_size)
        system.set_fluid_state("position", particles["positions"])
        system.set_fluid_state("velocity", particles["velocities"])
        system.set_fluid_state("species", particles["species"])
        return self._snapshot(system)

    def reset(self):
        self._require_system()
        return self.initialize(self.initial_config)

    def close(self):
        self.system = None
        self.initial_config = None
        if self.scene is not None:
            self.scene.close()
            self.scene = None

    def _require_system(self):
        if self.system is None:
            raise RuntimeError("Initialize a simulation before controlling or reading it.")
        return self.system

    @staticmethod
    def _integer(value, name, minimum):
        if type(value) is not int or not minimum <= value <= 2_147_483_647:
            raise ValueError(f"{name} must be an integer from {minimum} to 2147483647.")
        return value

    @staticmethod
    def _number(value, name, positive=False):
        if type(value) not in (int, float) or not math.isfinite(value):
            raise ValueError(f"{name} must be a finite number.")
        with np.errstate(over="ignore", invalid="ignore", under="ignore"):
            result = np.float32(value)
        if not np.isfinite(result) or (positive and result <= 0):
            raise ValueError(f"{name} must fit {'a positive' if positive else 'a finite'} float32 value.")
        return float(result)

    def _vector(self, value, name):
        if not isinstance(value, list) or len(value) != 3:
            raise ValueError(f"{name} must contain three numbers.")
        return np.array([self._number(component, name) for component in value], dtype=np.float32)

    def _particles(self, value, material_count, expected_count=None):
        if not isinstance(value, dict):
            raise ValueError("particles must be an object.")
        positions = value.get("positions")
        velocities = value.get("velocities")
        species = value.get("species")
        if not all(isinstance(field, list) for field in (positions, velocities, species)):
            raise ValueError("positions, velocities, and species must be arrays.")
        count = len(positions)
        if len(velocities) != count or len(species) != count:
            raise ValueError("positions, velocities, and species must have equal lengths.")
        if count > 2_147_483_647:
            raise ValueError("particle count exceeds the engine's integer range.")
        if expected_count is not None and count != expected_count:
            raise ValueError("set_particles must preserve the current particle count; initialize to resize it.")
        if any(type(index) is not int or not 0 <= index < material_count for index in species):
            raise ValueError("Every species id must be an integer indexing the material dictionary.")
        return {
            "positions": np.array([self._vector(row, "positions") for row in positions], dtype=np.float32).reshape(
                count, 3),
            "velocities": np.array([self._vector(row, "velocities") for row in velocities], dtype=np.float32).reshape(
                count, 3),
            "species": np.array(species, dtype=np.uint64),
        }

    @staticmethod
    def _check_positions(positions, lower, cell_size):
        with np.errstate(over="ignore", invalid="ignore", divide="ignore"):
            coordinates = np.floor((positions - lower) * (np.float32(1.0) / np.float32(cell_size)))
        if not np.all(np.isfinite(coordinates)) or np.any(coordinates < -2_147_483_648) or np.any(
                coordinates >= 2_147_483_647):
            raise ValueError("Particle positions exceed the engine's integer grid-coordinate range.")

    @staticmethod
    def _snapshot(system):
        positions = system.positions()
        velocities = system.velocities()
        species = system.species()
        time = system.step * system.dt
        if not np.all(np.isfinite(positions)) or not np.all(np.isfinite(velocities)) or not math.isfinite(time):
            raise ValueError("The engine produced non-finite simulation state; reset or replace its particles.")
        return {
            "step": system.step,
            "dt": system.dt,
            "time": time,
            "particle_count": system.particle_count,
            "cell_count": system.cell_count,
            "positions": positions.tolist(),
            "velocities": velocities.tolist(),
            "species": species.tolist(),
        }

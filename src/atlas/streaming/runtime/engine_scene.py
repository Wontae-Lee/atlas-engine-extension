import math
import tempfile
from pathlib import Path

import atlas
import numpy as np


class EngineScene:
    def __init__(self, number, vector):
        self.number = number
        self.vector = vector
        self.assets_directory = None
        self.output_directory = None
        self.geometry = {}
        self.geometry_configs = {}

    def build(self, config, materials, material_count):
        if config is None:
            return {}
        if not isinstance(config, dict):
            raise ValueError("scene must be an object.")
        assets = self._assets(config.get("assets", []))
        for entry in self._entries(config, "geometry"):
            self.geometry_configs[entry["id"]] = entry
            geometry = self._geometry(entry, assets)
            if not geometry.is_valid():
                raise ValueError(f"Geometry {entry['id']} is invalid or contains degenerate faces.")
            self.geometry[entry["id"]] = geometry
        emitters = [self._source(entry, materials, material_count) for entry in self._entries(config, "sources")]
        colliders = [self._boundary(entry) for entry in self._entries(config, "boundaries")]
        sinks = [self._sink(entry) for entry in self._entries(config, "sinks")]
        observer = self._observer(config.get("output"))
        return {"emitters": emitters, "colliders": colliders, "sinks": sinks, "observer": observer}

    def close(self):
        self.geometry.clear()
        self.geometry_configs.clear()
        if self.assets_directory is not None:
            self.assets_directory.cleanup()
            self.assets_directory = None

    def _assets(self, entries):
        if not isinstance(entries, list):
            raise ValueError("scene.assets must be an array.")
        assets = {}
        for index, entry in enumerate(entries):
            if not isinstance(entry, dict) or not isinstance(entry.get("id"), str) or not entry["id"]:
                raise ValueError("Every asset requires a non-empty string id.")
            if entry["id"] in assets:
                raise ValueError(f"Duplicate asset id: {entry['id']}")
            content = entry.get("content")
            if not isinstance(content, str) or not content.strip():
                raise ValueError(f"Asset {entry['id']} must contain OBJ text.")
            if self.assets_directory is None:
                self.assets_directory = tempfile.TemporaryDirectory(prefix="atlas-assets-")
            path = Path(self.assets_directory.name) / f"mesh_{index}.obj"
            path.write_text(content, encoding="utf-8")
            assets[entry["id"]] = str(path)
        return assets

    @staticmethod
    def _entries(config, section):
        entries = config.get(section, [])
        if not isinstance(entries, list):
            raise ValueError(f"scene.{section} must be an array.")
        identifiers = set()
        for entry in entries:
            if not isinstance(entry, dict) or not isinstance(entry.get("id"), str) or not entry["id"]:
                raise ValueError(f"Every {section} entry requires a non-empty string id.")
            if entry["id"] in identifiers:
                raise ValueError(f"Duplicate {section} id: {entry['id']}")
            identifiers.add(entry["id"])
            if not isinstance(entry.get("kind"), str) or not isinstance(entry.get("fields"), dict):
                raise ValueError(f"{section} entry {entry['id']} requires a kind and fields.")
        return entries

    def _float3(self, fields, key, default=None):
        return atlas.Float3(*self.vector(fields.get(key, default), key).tolist())

    def _scalar(self, fields, key, default=None, positive=False, nonnegative=False):
        value = self.number(fields.get(key, default), key, positive=positive)
        if nonnegative and value < 0:
            raise ValueError(f"{key} must be non-negative.")
        return value

    def _normal(self, fields):
        normal = self.vector(fields.get("normal"), "normal")
        length = np.linalg.norm(normal.astype(np.float64))
        if not math.isfinite(length) or length == 0:
            raise ValueError("normal must be non-zero.")
        return atlas.Float3(*(normal / length).tolist())

    def _geometry(self, entry, assets):
        fields, kind = entry["fields"], entry["kind"]
        if kind == "box":
            lower = self.vector(fields.get("lower"), "lower")
            upper = self.vector(fields.get("upper"), "upper")
            if not np.all(upper > lower):
                raise ValueError("Box upper must exceed lower on every axis.")
            return atlas.Box(atlas.Float3(*lower.tolist()), atlas.Float3(*upper.tolist()))
        if kind == "sphere":
            return atlas.Sphere(self._float3(fields, "center"), self._scalar(fields, "radius", positive=True))
        if kind == "cylinder":
            open_caps = fields.get("open", False)
            if type(open_caps) is not bool:
                raise ValueError("Cylinder open must be a boolean.")
            return atlas.Cylinder(
                self._float3(fields, "center"), self._scalar(fields, "radius", positive=True),
                self._scalar(fields, "height", positive=True), open=open_caps,
            )
        if kind == "plane":
            normal = self.vector(fields.get("normal"), "normal")
            length = float(np.linalg.norm(normal.astype(np.float64)))
            return atlas.Plane(self._normal(fields), self._scalar(fields, "offset") / length)
        if kind == "circle":
            return atlas.Circle(self._float3(fields, "center"), self._normal(fields), self._scalar(fields, "radius", positive=True))
        if kind == "square":
            return atlas.Square(self._float3(fields, "center"), self._normal(fields), self._scalar(fields, "side_length", positive=True))
        if kind == "triangle":
            vertices = [self.vector(fields.get(key), key) for key in ("a", "b", "c")]
            if np.linalg.norm(np.cross(vertices[1].astype(np.float64) - vertices[0], vertices[2].astype(np.float64) - vertices[0])) == 0:
                raise ValueError("Triangle vertices must not be collinear.")
            return atlas.Triangle(*(atlas.Float3(*vertex.tolist()) for vertex in vertices))
        if kind == "polygonal_prism":
            sides = fields.get("side_count")
            if type(sides) is not int or not 3 <= sides <= 2_147_483_647:
                raise ValueError("side_count must be an integer of at least 3 within the engine's range.")
            return atlas.PolygonalPrism(
                self._float3(fields, "center"), sides,
                self._scalar(fields, "radius", positive=True), self._scalar(fields, "height", positive=True),
            )
        if kind == "triangle_mesh":
            asset_id = fields.get("asset_id")
            if not isinstance(asset_id, str) or asset_id not in assets:
                raise ValueError(f"Mesh {entry['id']} refers to a missing asset.")
            return atlas.TriangleMesh(assets[asset_id])
        raise ValueError(f"Unsupported geometry kind: {kind}")

    def _unit(self, fields):
        geometry_id = fields.get("geometry_id")
        if not isinstance(geometry_id, str) or geometry_id not in self.geometry:
            raise ValueError("geometry_id must reference an existing geometry.")
        transform = self.geometry_configs[geometry_id]["fields"]
        rotation = self.vector(transform.get("rotation", [0, 0, 0]), "rotation")
        sync = atlas.Sync(
            translation=self._float3(transform, "translation", [0, 0, 0]),
            orientation=atlas.Quaternion.from_euler_xyz(*rotation.tolist()),
        )
        return atlas.Unit(
            self.geometry[geometry_id], sync=sync,
            velocity=self._float3(transform, "velocity", [0, 0, 0]),
            angular_velocity=self._float3(transform, "angular_velocity", [0, 0, 0]),
        )

    def _source(self, entry, materials, material_count):
        fields, kind = entry["fields"], entry["kind"]
        if kind not in ("volume", "surface"):
            raise ValueError(f"Unsupported source kind: {kind}")
        unit = self._unit(fields)
        geometry = self.geometry_configs[fields["geometry_id"]]
        if geometry["kind"] == "plane":
            raise ValueError("Sources require finite geometry; an infinite plane cannot be sampled.")
        if kind == "volume" and geometry["kind"] in ("circle", "square", "triangle"):
            raise ValueError("Volume sources require solid geometry.")
        material_id = fields.get("material_id")
        if type(material_id) is not int or not 0 <= material_id < material_count:
            raise ValueError("Source material_id must index the material dictionary.")
        spacing = self._scalar(fields, "spacing", 0.1, positive=True)
        bound = self.geometry[fields["geometry_id"]].bound()
        lower = np.array([getattr(bound.lower_corner, axis) for axis in ("x", "y", "z")], dtype=np.float32)
        upper = np.array([getattr(bound.upper_corner, axis) for axis in ("x", "y", "z")], dtype=np.float32)
        with np.errstate(over="ignore", invalid="ignore", divide="ignore", under="ignore"):
            dimensions = np.floor((upper - lower) / np.float32(spacing))
        if not np.all(np.isfinite(dimensions)) or np.any(dimensions < 0) or np.any(dimensions >= 2_147_483_647):
            raise ValueError("Source sampling dimensions exceed the engine's integer range.")
        if math.prod(int(value) + 1 for value in dimensions) > 2_147_483_647:
            raise ValueError("Source sample count exceeds the engine's integer range.")
        source_type = atlas.VolumeSource if kind == "volume" else atlas.SurfaceSource
        source = source_type(unit, spacing=spacing, tolerance=self._scalar(fields, "tolerance", 0, nonnegative=True))
        if source.cached_count == 0:
            raise ValueError(f"Source {entry['id']} samples no positions; adjust its geometry, spacing, or tolerance.")
        generator = atlas.MaxwellBoltzmannGenerator(
            species_ratios=[1.0], species_numbers=[float(material_id)], materials=materials,
            temperature=self._scalar(fields, "temperature", 273.15, nonnegative=True),
            bulk_velocity=self._float3(fields, "bulk_velocity", [0, 0, 0]),
        )
        return source, generator

    def _boundary(self, entry):
        fields = entry["fields"]
        if entry["kind"] != "isothermal":
            raise ValueError(f"Unsupported boundary kind: {entry['kind']}")
        accommodation = self._scalar(fields, "momentum_accommodation_coefficient", 1, nonnegative=True)
        if accommodation > 1:
            raise ValueError("momentum_accommodation_coefficient must lie in [0, 1].")
        sampling = fields.get("diffuse_sampling", "uniform")
        if sampling not in ("uniform", "cosine_weighted"):
            raise ValueError("diffuse_sampling must be uniform or cosine_weighted.")
        return atlas.IsothermalCollider(
            self._unit(fields), momentum_accommodation_coefficient=accommodation,
            restitution=self._scalar(fields, "restitution", 1, nonnegative=True),
            diffuse_sampling=getattr(atlas.DiffuseSampling, sampling),
        )

    def _sink(self, entry):
        fields, kind = entry["fields"], entry["kind"]
        unit = self._unit(fields)
        if kind == "tracing":
            return atlas.TracingSink(unit)
        if kind in ("volume", "surface"):
            sink_type = atlas.VolumeSink if kind == "volume" else atlas.SurfaceSink
            return sink_type(unit, tolerance=self._scalar(fields, "tolerance", 0, nonnegative=True))
        raise ValueError(f"Unsupported sink kind: {kind}")

    def _observer(self, config):
        if not isinstance(config, dict) or type(config.get("enabled")) is not bool:
            raise ValueError("scene.output must contain an enabled boolean.")
        if not config["enabled"]:
            return None
        interval = config.get("interval")
        if type(interval) is not int or not 1 <= interval <= 2_147_483_647:
            raise ValueError("Output interval must be a positive integer within the engine's range.")
        directory = config.get("output_directory")
        if not isinstance(directory, str) or not directory or "\\" in directory:
            raise ValueError("output_directory must be a relative container path.")
        path = Path(directory)
        if path.is_absolute() or ".." in path.parts:
            raise ValueError("output_directory must be relative and must not contain '..'.")
        self.output_directory = str(Path(tempfile.gettempdir()) / "atlas-results" / path)
        return atlas.Observer(interval=interval, output_directory=self.output_directory)

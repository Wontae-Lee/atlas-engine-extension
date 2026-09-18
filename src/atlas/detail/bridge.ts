/**
 * The published image exposes a Python library rather than a network server.
 * This program runs inside the container and exchanges one JSON object per line.
 * A separate file descriptor keeps native Atlas output away from protocol stdout.
 */
export const BRIDGE = String.raw`
import contextlib
import io
import json
import os
import runpy
import sys

protocol = os.fdopen(os.dup(sys.stdout.fileno()), "w", buffering=1)
os.dup2(sys.stderr.fileno(), sys.stdout.fileno())

import atlas
import numpy as np
from atlas import _core, Float3, Fluid
from atlas.math import dot

def info():
    vector = Float3(1.0, 2.0, 3.0)
    if dot(vector, vector) != 14.0:
        raise RuntimeError("Atlas native math check failed")
    positions = np.array([[1.0, 2.0, 3.0]], dtype=np.float32)
    zeros = np.zeros((1, 3), dtype=np.float32)
    fluid = Fluid.from_arrays(positions, zeros)
    fluid.reset_state("position")
    if not np.array_equal(fluid.positions(), zeros):
        raise RuntimeError("Atlas device kernel check failed")
    return {
        "engine": _core.engine,
        "version": atlas.__version__,
        "protocol": 1,
        "availableEngines": list(atlas.available_engines()),
    }

for line in sys.stdin:
    request_id = None
    try:
        request = json.loads(line)
        request_id = request["id"]
        if request["method"] == "info":
            result = info()
        elif request["method"] == "smoke":
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                runpy.run_path("/opt/atlas/examples/python/dsmc_dense_cell.py", run_name="__main__")
            result = {"output": output.getvalue()}
        else:
            raise ValueError("Unknown backend method")
        response = {"id": request_id, "result": result}
    except Exception as error:
        response = {"id": request_id, "error": str(error)}
    print(json.dumps(response), file=protocol, flush=True)
`;

import atlas
import json
import numpy as np
import sys
from atlas import Float3, Fluid, _core
from atlas.math import dot

from .engine_session import EngineSession


class EngineServer:
    def __init__(self, protocol):
        self.protocol = protocol
        self.session = EngineSession()

    def serve(self):
        try:
            for line in sys.stdin:
                request_id = None
                try:
                    request = json.loads(line, parse_constant=self._reject_constant)
                    if not isinstance(request, dict):
                        raise ValueError("Request must be an object.")
                    request_id = request.get("id")
                    if type(request_id) is not int or not 1 <= request_id <= 9_007_199_254_740_991:
                        request_id = None
                        raise ValueError("Request id must be a positive safe integer.")
                    result = self._dispatch(request)
                    response = json.dumps({"id": request_id, "result": result}, allow_nan=False)
                except Exception as error:
                    response = json.dumps({"id": request_id, "error": str(error) or type(error).__name__},
                                          allow_nan=False)
                print(response, file=self.protocol, flush=True)
        finally:
            self.session.close()

    def _dispatch(self, request):
        method = request.get("method")
        if not isinstance(method, str):
            raise ValueError("Request method must be a string.")
        with_params = {
            "initialize": self.session.initialize,
            "step": self.session.step,
            "set_particles": self.session.set_particles,
        }
        without_params = {
            "info": self.info,
            "snapshot": self.session.snapshot,
            "reset": self.session.reset,
            "close": self.session.close,
        }
        if method in with_params:
            return with_params[method](request.get("params"))
        if method in without_params:
            if request.get("params") is not None:
                raise ValueError(f"{method} does not accept parameters.")
            return without_params[method]()
        raise ValueError(f"Unknown engine method: {method}")

    @staticmethod
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

    @staticmethod
    def _reject_constant(value):
        raise ValueError(f"Non-finite JSON number is not supported: {value}")

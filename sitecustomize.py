"""
Global startup tweaks for test/CI environments.

This module is imported automatically by Python at startup if it is discoverable
on sys.path. We use it to apply a tiny compatibility shim between FastAPI versions
that expect a pydantic v1 FieldInfo (with `in_`) and environments that provide
pydantic v2 (which removed that attribute).
"""


def _compat_patch():
    try:
        # Only apply if pydantic v2 FieldInfo exists and lacks `in_`.
        from pydantic.fields import FieldInfo as _PDFieldInfo  # type: ignore

        if _PDFieldInfo is not None and not hasattr(_PDFieldInfo, "in_"):

            def _get_in(self):
                return getattr(self, "_in", None)

            def _set_in(self, value):
                setattr(self, "_in", value)

            try:
                _PDFieldInfo.in_ = property(_get_in, _set_in)  # type: ignore[attr-defined]
            except Exception:
                pass
    except Exception:
        # If anything goes wrong, never block interpreter startup.
        pass


_compat_patch()

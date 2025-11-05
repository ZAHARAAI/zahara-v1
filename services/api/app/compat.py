"""
Compatibility shim for FastAPI / Pydantic field attribute differences.

- Some FastAPI versions look for `FieldInfo.in_` (Pydantic v1 era).
- Pydantic v2 removed that attribute.

When this module is imported, we add a minimal property `in_` to v2's FieldInfo
so older FastAPI dependency code won't crash. If the attribute already exists,
we do nothing.
"""


def _apply_patch():
    try:
        from pydantic.fields import FieldInfo as _PDFieldInfo  # type: ignore

        if _PDFieldInfo is not None and not hasattr(_PDFieldInfo, "in_"):

            def _get_in(self):
                return getattr(self, "_in", None)

            def _set_in(self, value):
                setattr(self, "_in", value)

            try:
                _PDFieldInfo.in_ = property(_get_in, _set_in)  # type: ignore[attr-defined]
            except Exception:
                # Never fail if environment forbids attribute assignment
                pass
    except Exception:
        # Be best-effort and silent
        pass


_apply_patch()

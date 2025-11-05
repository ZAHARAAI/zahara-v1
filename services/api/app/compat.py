"""
Compatibility shim for FastAPI / Pydantic field attribute differences.

- Some FastAPI versions look for `FieldInfo.in_` (Pydantic v1 era).
- Pydantic v2 removed that attribute; FastAPI>=0.103 adapted, but older envs may not.

This module patches Pydantic v2's FieldInfo to expose a best-effort `in_`
property, and also wraps FastAPI's `Form` helper to ensure created fields carry
`in_ = ParamTypes.form`. Harmless no-ops if not needed.
"""


def _patch_fieldinfo():
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
                # Some environments disallow attribute assignment; ignore.
                pass
    except Exception:
        # Best-effort only
        pass


def _wrap_form_helper():
    try:
        # Old FastAPI code may check `field_info.in_ == ParamTypes.form`
        from fastapi import params as _params

        _orig_Form = _params.Form

        def Form(*args, **kwargs):
            fi = _orig_Form(*args, **kwargs)
            try:
                # If FieldInfo lacks in_, set it explicitly for form fields
                if not hasattr(fi, "in_") or getattr(fi, "in_", None) is None:
                    try:
                        form_enum = _params.ParamTypes.form
                    except Exception:
                        form_enum = "form"  # sensible fallback
                    try:
                        # prefer attribute to work with our property
                        setattr(fi, "in_", form_enum)
                    except Exception:
                        # fall back to private storage used by our FieldInfo property
                        setattr(fi, "_in", form_enum)
            except Exception:
                pass
            return fi

        # Only replace if not already wrapped
        if getattr(_params.Form, "__wrapped_by_compat__", False) is not True:
            Form.__wrapped_by_compat__ = True  # type: ignore[attr-defined]
            _params.Form = Form  # type: ignore[assignment]
    except Exception:
        # If fastapi.params is absent / different, silently skip.
        pass


def _apply_patch():
    _patch_fieldinfo()
    _wrap_form_helper()


_apply_patch()

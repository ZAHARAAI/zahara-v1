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


def _subclass_form_to_set_in():
    try:
        from fastapi import params as _params

        _OrigForm = _params.Form

        # Only proceed if Form is a type (class). If it's already wrapped, keep it.
        if isinstance(_OrigForm, type) and not getattr(
            _OrigForm, "__compat_wrapped__", False
        ):

            class _CompatForm(_OrigForm):  # type: ignore[misc]
                __compat_wrapped__ = True

                def __init__(self, *args, **kwargs):
                    super().__init__(*args, **kwargs)
                    try:
                        form_enum = getattr(_params, "ParamTypes", None)
                        form_value = getattr(form_enum, "form") if form_enum else "form"
                    except Exception:
                        form_value = "form"
                    # Try assign via property; fall back to private attr used by our FieldInfo patch
                    try:
                        setattr(self, "in_", form_value)
                    except Exception:
                        try:
                            setattr(self, "_in", form_value)
                        except Exception:
                            pass

            _params.Form = _CompatForm  # type: ignore[assignment]
    except Exception:
        # If fastapi.params isn't available or changes shape, silently skip.
        pass


def _apply_patch():
    _patch_fieldinfo()
    _subclass_form_to_set_in()


_apply_patch()

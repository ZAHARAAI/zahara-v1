"""
Compatibility shim for FastAPI / Pydantic field attribute differences.

Context
-------
Older FastAPI versions expect a Pydantic v1-style attribute `FieldInfo.in_`
and also rely on `fastapi.params.Form` instances having `in_ == ParamTypes.form`.
With Pydantic v2, `in_` no longer exists, which can break dependency analysis
(e.g., OAuth2PasswordRequestForm fields like `grant_type`).

What this module does
---------------------
1) Adds a backwards-compatible `.in_` property to Pydantic v2's FieldInfo
   (no-op if it already exists).
2) Ensures `fastapi.params.Form` instances end up with `in_ = ParamTypes.form`
   so older internals classify them as body/form fields instead of “non-body”.
3) Normalizes class attributes on OAuth2PasswordRequestForm if necessary.

All operations are best-effort and no-op on newer stacks.
"""


def _patch_fieldinfo_in_attr():
    try:
        from pydantic.fields import FieldInfo as _PDFieldInfo  # type: ignore
    except Exception:
        _PDFieldInfo = None

    if _PDFieldInfo is None:
        return

    if not hasattr(_PDFieldInfo, "in_"):

        def _get_in(self):
            return getattr(self, "_in", None)

        def _set_in(self, value):
            setattr(self, "_in", value)

        try:
            _PDFieldInfo.in_ = property(_get_in, _set_in)  # type: ignore[attr-defined]
        except Exception:
            pass


def _ensure_form_sets_in_():
    """
    Keep fastapi.params.Form as a *type* (class) and ensure instances get `in_='form'`.
    This way: isinstance(field_info, params.Form) still works on older FastAPI.
    """
    try:
        from fastapi import params as _params
    except Exception:
        return

    _OrigForm = getattr(_params, "Form", None)
    if _OrigForm is None:
        return

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
                try:
                    setattr(self, "in_", form_value)
                except Exception:
                    try:
                        setattr(self, "_in", form_value)
                    except Exception:
                        pass

        try:
            _params.Form = _CompatForm  # type: ignore[assignment]
        except Exception:
            pass


def _normalize_oauth2passwordrequestform_fields():
    """
    Ensure OAuth2PasswordRequestForm's class-level Form(...) attrs have in_='form'
    even if they were created before our patches.
    """
    try:
        from fastapi import params as _params
        from fastapi.security import oauth2 as _oauth2
    except Exception:
        return

    FormType = getattr(_params, "Form", None)
    FormEnum = getattr(_params, "ParamTypes", None)
    form_value = getattr(FormEnum, "form", "form") if FormEnum else "form"

    OAuth2PasswordRequestForm = getattr(_oauth2, "OAuth2PasswordRequestForm", None)
    if OAuth2PasswordRequestForm is None:
        return

    try:
        for _, value in vars(OAuth2PasswordRequestForm).items():
            if FormType and isinstance(value, FormType):
                try:
                    if not hasattr(value, "in_") or getattr(value, "in_", None) is None:
                        setattr(value, "in_", form_value)
                except Exception:
                    try:
                        setattr(value, "_in", form_value)
                    except Exception:
                        pass
    except Exception:
        pass


def _apply_patch():
    _patch_fieldinfo_in_attr()
    _ensure_form_sets_in_()
    _normalize_oauth2passwordrequestform_fields()


_apply_patch()

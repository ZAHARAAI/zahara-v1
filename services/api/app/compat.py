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
2) Replaces `fastapi.params.Form` with a small subclass that sets `self.in_`
   (or a private `_in`) to `ParamTypes.form`, so `isinstance(..., params.Form)`
   remains valid and `in_` is populated.
3) Proactively normalizes the class attributes on
   `fastapi.security.oauth2.OAuth2PasswordRequestForm` (e.g., `grant_type`,
   `username`, `password`, `scope`, `client_id`, `client_secret`) to ensure
   they carry `in_ = ParamTypes.form` even if they were imported before some
   internals stabilized.

This whole module tries very hard to be a no-op on newer stacks.
"""


def _patch_fieldinfo_in_attr():
    """Add .in_ property to Pydantic v2 FieldInfo if missing."""
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
            # Best-effort: never crash.
            pass


def _ensure_form_sets_in_():
    """
    Make sure fastapi.params.Form remains a *type* (class) that sets in_ to 'form'
    on instances, so:
      - isinstance(field_info, params.Form) works
      - field_info.in_ is present and equals ParamTypes.form
    """
    try:
        from fastapi import params as _params
    except Exception:
        return

    _OrigForm = getattr(_params, "Form", None)
    if _OrigForm is None:
        return

    # Only wrap once and only if it's a class (older FastAPI defines it as a class)
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
                # Prefer the property (if our FieldInfo patch added it)
                try:
                    setattr(self, "in_", form_value)
                except Exception:
                    # Fall back to the private slot used by our property
                    try:
                        setattr(self, "_in", form_value)
                    except Exception:
                        pass

        try:
            _params.Form = _CompatForm  # type: ignore[assignment]
        except Exception:
            # If assignment is blocked, we still proceed with the rest.
            pass


def _normalize_oauth2passwordrequestform_fields():
    """
    OAuth2PasswordRequestForm defines class attributes via Form(...).
    If those were created before our wrapper / property, they may lack `in_`.
    This pass ensures they have `in_ = ParamTypes.form`.
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
        for name, value in vars(OAuth2PasswordRequestForm).items():
            # The class attributes for grant_type, username, password, scope, client_id, client_secret
            # are instances of fastapi.params.Form (i.e., Param subclass)
            if FormType and isinstance(value, FormType):
                # Attach in_ if missing / None
                try:
                    if not hasattr(value, "in_") or getattr(value, "in_", None) is None:
                        setattr(value, "in_", form_value)
                except Exception:
                    try:
                        setattr(value, "_in", form_value)
                    except Exception:
                        pass
    except Exception:
        # Never break imports
        pass


def _apply_patch():
    _patch_fieldinfo_in_attr()
    _ensure_form_sets_in_()
    _normalize_oauth2passwordrequestform_fields()


# Execute as soon as this module is imported.
_apply_patch()

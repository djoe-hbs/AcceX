from core.user.models import User


CREATE_USER_ROLE_MATRIX = {
    User.Role.SUPERADMIN: {
        User.Role.ADMIN,
        User.Role.SME,
        User.Role.PRODUCTION_USER,
        User.Role.VALIDATION_USER,
    },
    User.Role.ADMIN: {
        User.Role.SME,
        User.Role.PRODUCTION_USER,
        User.Role.VALIDATION_USER,
    },
}

CHANGE_PASSWORD_ROLE_MATRIX = {
    User.Role.SUPERADMIN: {
        User.Role.ADMIN,
        User.Role.SME,
        User.Role.PRODUCTION_USER,
        User.Role.VALIDATION_USER,
    },
    User.Role.ADMIN: {
        User.Role.SME,
        User.Role.PRODUCTION_USER,
        User.Role.VALIDATION_USER,
    },
}


def can_create_user_with_role(actor_role, target_role):
    return target_role in CREATE_USER_ROLE_MATRIX.get(actor_role, set())


def can_change_other_password(actor_role, target_role):
    return target_role in CHANGE_PASSWORD_ROLE_MATRIX.get(actor_role, set())


def is_superadmin(user):
    return bool(user and getattr(user, "role", None) == User.Role.SUPERADMIN)


def is_admin(user):
    return bool(user and getattr(user, "role", None) == User.Role.ADMIN)

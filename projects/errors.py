class ExistsError(RuntimeError):
    """Error to return if trying to create a project that already exists"""
    pass


class SpecError(RuntimeError):
    """Error to return if attempting to initialize a project from a bad specification"""
    pass


class PermissionError(RuntimeError):
    """Error to return if attempting to share or publish a project you do not own"""
    pass


class InvalidProjectError(RuntimeError):
    """Error to return if trying to share an invalid project (without a project directory)"""
    pass


class InviteError(RuntimeError):
    """Error to return if an invitee cannot be validated"""
    pass

"""
Authenticate JupyterHub with a GenePattern server

@author Thorin Tabor
"""

from .gpauthenticator import GenePatternAuthenticator

__all__ = [GenePatternAuthenticator]

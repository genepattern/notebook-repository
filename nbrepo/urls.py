"""nbrepo URL Configuration

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/1.10/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  url(r'^$', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  url(r'^$', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.conf.urls import url, include
    2. Add a URL to urlpatterns:  url(r'^blog/', include('blog.urls'))
"""
from django.conf.urls import url, include
from django.contrib import admin
from rest_framework import routers

from nbrepo.preview import preview
from nbrepo.views import NotebookViewSet, TagViewSet, copy, download, obtain_auth_token, migrate_account, WebtourViewSet, webtour_seen

from .sharing import SharingViewSet, CollaboratorViewSet, begin_sharing, accept_sharing, current_collaborators, error_redirect, urlpatterns as sharingpatterns

# Routers provide an easy way of automatically determining the URL conf.
router = routers.DefaultRouter()
# router.register(r'users', UserViewSet)
# router.register(r'groups', GroupViewSet)
router.register(r'webtours', WebtourViewSet)
router.register(r'notebooks', NotebookViewSet)
router.register(r'tags', TagViewSet)
router.register(r'sharing', SharingViewSet)
router.register(r'collaborators', CollaboratorViewSet)

urlpatterns = [
    url(r'^admin/', admin.site.urls),

    # Django Rest Framework
    url(r'^services/sharing/api-auth/', include('rest_framework.urls', namespace='rest_framework')),
    url(r'^services/sharing/api-token-auth/', obtain_auth_token),

    # GenePattern Notebook Repo endpoints
    url(r'^services/sharing/notebooks/(?P<pk>[0-9]+)/copy/(?P<api_path>.*)$', copy),
    url(r'^services/sharing/notebooks/(?P<pk>[0-9]+)/download/$', download),
    url(r'^services/sharing/notebooks/(?P<pk>[0-9]+)/preview/$', preview),

    # Webtour endpoints
    url(r'^services/sharing/webtours/(?P<user>.*)/$', webtour_seen),
]

# Add the sharing URLs
urlpatterns += sharingpatterns

urlpatterns += [
    url(r'^services/sharing/', include(router.urls)),
]


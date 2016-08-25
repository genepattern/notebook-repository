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
from rest_framework.authtoken import views
from nbrepo.views import UserViewSet, GroupViewSet, NotebookViewSet, copy


# Routers provide an easy way of automatically determining the URL conf.
router = routers.DefaultRouter()
router.register(r'users', UserViewSet)
router.register(r'groups', GroupViewSet)
router.register(r'notebooks', NotebookViewSet)

urlpatterns = [
    url(r'^admin/', admin.site.urls),

    # Django Rest Framework
    url(r'^api-auth/', include('rest_framework.urls', namespace='rest_framework')),
    url(r'^api-token-auth/', views.obtain_auth_token),
    url(r'^notebooks/(?P<pk>[0-9]+)/copy/(?P<api_path>.*)$', copy),
    url(r'^', include(router.urls)),
]


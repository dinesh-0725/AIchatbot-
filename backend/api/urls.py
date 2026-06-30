from django.urls import path
from .views import (
    ChatSessionList, 
    ChatSessionDetail, 
    ChatSendMessage, 
    SavedSnippetList, 
    SavedSnippetDetail, 
    PresetTemplateList
)

urlpatterns = [
    path('presets/', PresetTemplateList.as_view(), name='preset-templates'),
    path('sessions/', ChatSessionList.as_view(), name='chat-sessions'),
    path('sessions/<uuid:pk>/', ChatSessionDetail.as_view(), name='chat-session-detail'),
    path('sessions/<uuid:pk>/send/', ChatSendMessage.as_view(), name='chat-send-message'),
    path('snippets/', SavedSnippetList.as_view(), name='saved-snippets'),
    path('snippets/<uuid:pk>/', SavedSnippetDetail.as_view(), name='saved-snippet-detail'),
]

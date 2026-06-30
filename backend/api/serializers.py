from rest_framework import serializers
from .models import ChatSession, ChatMessage, SavedSnippet, PresetProjectTemplate

class ChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatMessage
        fields = ['id', 'role', 'content', 'created_at']

class ChatSessionSerializer(serializers.ModelSerializer):
    message_count = serializers.IntegerField(source='messages.count', read_only=True)
    
    class Meta:
        model = ChatSession
        fields = ['id', 'title', 'created_at', 'updated_at', 'message_count']

class ChatSessionDetailSerializer(serializers.ModelSerializer):
    messages = ChatMessageSerializer(many=True, read_only=True)
    
    class Meta:
        model = ChatSession
        fields = ['id', 'title', 'created_at', 'updated_at', 'messages']

class SavedSnippetSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedSnippet
        fields = ['id', 'title', 'language', 'code', 'explanation', 'tags', 'created_at']

class PresetProjectTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = PresetProjectTemplate
        fields = ['id', 'name', 'framework', 'description', 'prompt_template', 'complexity']

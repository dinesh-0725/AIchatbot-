import os
import json
import google.generativeai as genai
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404
from django.db.models import Q

from .models import ChatSession, ChatMessage, SavedSnippet, PresetProjectTemplate
from .serializers import (
    ChatSessionSerializer, 
    ChatSessionDetailSerializer, 
    ChatMessageSerializer,
    SavedSnippetSerializer, 
    PresetProjectTemplateSerializer
)

# Helper function to get preset templates list
def get_default_presets():
    return [
        {
            "name": "Spring Boot JWT Authentication & Role-Based Access Control",
            "framework": "springboot",
            "complexity": "Expert",
            "description": "A complete implementation of Spring Security 6 with JWT tokens, refresh tokens, user registration, role-based authorization (ADMIN/USER), and custom exceptions.",
            "prompt_template": "Create an advanced, production-grade Spring Boot (version 3+) project for JWT Authentication and Role-Based Access Control. Include: 1. User and Role entities with database relations. 2. JWT Filter, Token Provider, and Security Config. 3. AuthController with endpoints for signup, login, refresh token, and protected resource access. 4. Repository and Service classes. 5. Custom error handling. Provide the directory structure and complete, functional code for each file."
        },
        {
            "name": "Django Multi-Tenant SaaS Billing & Database Router",
            "framework": "django",
            "complexity": "Hard",
            "description": "Multi-tenant architecture in Django using separate databases or schemas per tenant. Includes custom middleware for tenant detection and database routers.",
            "prompt_template": "Create a Django project implementing multi-tenancy with a separate-database-per-tenant pattern. Include: 1. Tenant models and tenant routing middleware that reads the host or header to set active tenant. 2. A custom Django database router to dynamically route database operations based on active tenant. 3. Sample models for Tenant and TenantSpecificData. 4. A setup command to run migrations across all tenants. Provide full code and folder structure."
        },
        {
            "name": "React Infinite Scroll Grid with Virtualization & Search",
            "framework": "react",
            "complexity": "Hard",
            "description": "High-performance virtualized grid in React (no external heavy libraries like react-virtualized) to render 100,000+ items smoothly with dynamic search, caching, and loading skeletons.",
            "prompt_template": "Create an advanced React dashboard component that implements a custom virtualized infinite scroll grid. It should: 1. Calculate visible item indices dynamically based on container scroll position. 2. Feature debounce search, filter overlays, and cell-level custom renders. 3. Handle asynchronous data fetching mock simulation with loading state. 4. Show sleek hover animation, copy to clipboard capability for items, and full responsive design. Provide the complete implementation."
        },
        {
            "name": "MongoDB Complex E-Commerce Aggregation Pipeline",
            "framework": "mongodb",
            "complexity": "Expert",
            "description": "Complex aggregation queries for calculating monthly recurring revenue, customer cohort retention, product recommendation matrix, and nested document inventory reports.",
            "prompt_template": "Create a set of complex MongoDB aggregation pipelines for an e-commerce platform. Include: 1. Customer cohort retention rates (grouped by signup month). 2. Recommendation engine based on co-purchase history (users who bought X also bought Y). 3. Monthly sales reporting with nested tax calculations and refund adjustments. Explain each stage of the pipeline ($lookup, $unwind, $group, $facet, $project) with sample schemas and inputs."
        },
        {
            "name": "SQL Advanced Financial Ledger with Window Functions & CTEs",
            "framework": "sql",
            "complexity": "Expert",
            "description": "Advanced SQL ledger queries to calculate running balances, FIFO inventory valuation, gap detection in transaction IDs, and year-over-year growth analytics.",
            "prompt_template": "Write advanced SQL queries for a financial transactions ledger database. Provide: 1. Running balance calculation using window functions (SUM() OVER). 2. First-In-First-Out (FIFO) inventory valuation using recursive CTEs. 3. Year-over-Year (YoY) revenue comparison with quarterly breakdowns using LEAD/LAG. 4. Transaction gap analysis to detect missing invoice sequences. Use standard PostgreSQL or MySQL dialect and explain query execution plans."
        },
        {
            "name": "Java Multi-threaded Task Scheduler with Priority Queue",
            "framework": "java",
            "complexity": "Expert",
            "description": "Custom priority-based task scheduler in pure Java using Concurrency APIs, ReentrantLocks, Condition variables, and a custom ThreadPool Executor.",
            "prompt_template": "Write a complete Java multi-threaded scheduler system. It should: 1. Accept tasks with custom priorities (High, Medium, Low) and execution delays. 2. Implement a custom thread pool that executes tasks concurrently. 3. Use ReentrantLocks and Condition variables for thread safety instead of simple synchronized blocks. 4. Provide graceful shutdown mechanisms and status reporting. Avoid built-in scheduled executors; build it from low-level concurrent utilities."
        },
        {
            "name": "Python Asynchronous Web Scraper with Proxy Rotation",
            "framework": "python",
            "complexity": "Expert",
            "description": "High-performance web scraper using asyncio and aiohttp. Features proxy rotation, user-agent randomizers, rate limiting, and writing results to a SQLite database.",
            "prompt_template": "Write an advanced asynchronous Python scraper using `asyncio` and `aiohttp`. Requirements: 1. Fetch data from multiple pages concurrently with rate limiters. 2. Implement robust proxy rotation and random User-Agent headers. 3. Parse data using BeautifulSoup asynchronously. 4. Persist data to SQLite database using an async database adapter (aiosqlite) or standard thread pool executor database writes. 5. Include retry mechanics with exponential backoff for failed requests. Provide the complete code."
        }
    ]

class PresetTemplateList(APIView):
    def get(self, request):
        # Auto-seed presets if table is empty
        if PresetProjectTemplate.objects.count() == 0:
            for item in get_default_presets():
                PresetProjectTemplate.objects.create(**item)
        
        presets = PresetProjectTemplate.objects.all()
        serializer = PresetProjectTemplateSerializer(presets, many=True)
        return Response(serializer.data)

class ChatSessionList(APIView):
    def get(self, request):
        sessions = ChatSession.objects.all()
        serializer = ChatSessionSerializer(sessions, many=True)
        return Response(serializer.data)

    def post(self, request):
        title = request.data.get('title', 'New Conversation')
        session = ChatSession.objects.create(title=title)
        serializer = ChatSessionSerializer(session)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

class ChatSessionDetail(APIView):
    def get_object(self, pk):
        try:
            return ChatSession.objects.get(pk=pk)
        except ChatSession.DoesNotExist:
            return None

    def get(self, request, pk):
        session = self.get_object(pk)
        if not session:
            return Response({"error": "Session not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = ChatSessionDetailSerializer(session)
        return Response(serializer.data)

    def put(self, request, pk):
        session = self.get_object(pk)
        if not session:
            return Response({"error": "Session not found"}, status=status.HTTP_404_NOT_FOUND)
        title = request.data.get('title')
        if title:
            session.title = title
            session.save()
            return Response(ChatSessionSerializer(session).data)
        return Response({"error": "Title is required"}, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        session = self.get_object(pk)
        if not session:
            return Response({"error": "Session not found"}, status=status.HTTP_404_NOT_FOUND)
        session.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

class ChatSendMessage(APIView):
    def post(self, request, pk):
        session = ChatSession.objects.filter(pk=pk).first()
        if not session:
            return Response({"error": "Session not found"}, status=status.HTTP_404_NOT_FOUND)

        user_content = request.data.get('content')
        if not user_content:
            return Response({"error": "Content is required"}, status=status.HTTP_400_BAD_REQUEST)

        # Save user message
        user_message = ChatMessage.objects.create(
            session=session,
            role='user',
            content=user_content
        )

        # Get API key from header or env
        api_key = request.headers.get('X-Gemini-Key') or os.getenv('GEMINI_API_KEY')
        
        # Build conversation history context
        # Limit context to last 15 messages
        history = []
        messages_query = session.messages.all().order_by('created_at')
        messages_count = messages_query.count()
        if messages_count > 15:
            # We want the last 15, which means we slice the query
            # (Note: Django evaluates slices, but we need to convert to list or subquery)
            messages_list = list(messages_query[messages_count - 15:])
        else:
            messages_list = list(messages_query)

        for msg in messages_list:
            # Don't include the message we just created to avoid duplication
            if msg.id == user_message.id:
                continue
            history.append({
                "role": "user" if msg.role == "user" else "model",
                "parts": [msg.content]
            })

        # System Instruction for Generating Code projects
        system_instruction = (
            "You are Antigravity Code Architect, a world-class senior software engineer and system designer. "
            "Your goal is to help developers implement extremely tough, complex, and production-grade project codes in "
            "Spring Boot, Django, React, JS, MongoDB, SQL, Java, and Python.\n\n"
            "CRITICAL FORMATTING INSTRUCTIONS:\n"
            "1. Start with a short overview describing the architecture and design decisions.\n"
            "2. Render the directory structure of the project inside a code block marked with language 'structure' or 'tree'. Example:\n"
            "```structure\n"
            "my-project/\n"
            "├── src/\n"
            "│   ├── main/java/...\n"
            "└── pom.xml\n"
            "```\n"
            "3. Provide FULL, complete, functional implementations for every critical file. Avoid placeholders, '// TODO' or 'rest of code goes here'. Make it complete.\n"
            "4. BEFORE each code block, write a markdown header containing the filename exactly like this:\n"
            "### FILE: path/to/file.extension\n"
            "Then output the code inside a normal markdown code block with the appropriate syntax highlighting language (e.g. ```java, ```javascript, ```python, ```sql). Example:\n"
            "### FILE: src/main/java/Config.java\n"
            "```java\n"
            "// complete code here\n"
            "```\n"
            "5. After the files, add a brief 'How to Run' section.\n"
            "Make all code robust, security-focused, clean, and follow the best industry practices."
        )

        assistant_content = ""
        
        if not api_key:
            # Fallback mock/warning if API Key is not set
            assistant_content = (
                "⚠️ **Gemini API Key is not configured.**\n\n"
                "Please add your Gemini API Key in the **Settings Panel** (cog icon on the top right) to connect to live AI models. "
                "Below is a structured template mock showing how the AI will organize your request once a key is connected:\n\n"
                "### Architectural Overview\n"
                "We implement a clean architecture with clear separation of concerns (Controllers, Services, Repositories).\n\n"
                "### Directory Structure\n"
                "```structure\n"
                "project-root/\n"
                "├── config/\n"
                "│   └── database.py\n"
                "├── controllers/\n"
                "│   └── main_controller.py\n"
                "└── README.md\n"
                "```\n\n"
                "### FILE: config/database.py\n"
                "```python\n"
                "# Database Configuration File\n"
                "import os\n\n"
                "def get_database_url():\n"
                "    return os.getenv('DATABASE_URL', 'sqlite:///dev.db')\n"
                "```\n\n"
                "### FILE: controllers/main_controller.py\n"
                "```python\n"
                "# Main Controller\n"
                "class MainController:\n"
                "    def __init__(self, db):\n"
                "        self.db = db\n\n"
                "    def get_status(self):\n"
                "        return {'status': 'active', 'database': 'connected'}\n"
                "```\n"
            )
        else:
            try:
                # Initialize Gemini API
                genai.configure(api_key=api_key)
                
                # Check for temperature or custom parameters from settings
                temperature = float(request.data.get('temperature', 0.2))
                model_name = request.data.get('model', 'gemini-2.5-flash')
                
                # Configure generation parameters
                generation_config = {
                    "temperature": temperature,
                    "top_p": 0.95,
                    "top_k": 40,
                    "max_output_tokens": 8192,
                }
                
                # Load Model
                model = genai.GenerativeModel(
                    model_name=model_name,
                    generation_config=generation_config,
                    system_instruction=system_instruction
                )
                
                # Format chat session
                chat = model.start_chat(history=history)
                response = chat.send_message(user_content)
                assistant_content = response.text
            except Exception as e:
                assistant_content = f"❌ **Error calling Gemini API:**\n```\n{str(e)}\n```\n\nPlease check your API key and connection."

        # Save assistant message
        assistant_message = ChatMessage.objects.create(
            session=session,
            role='assistant',
            content=assistant_content
        )

        # Update session timestamp so it floats to the top
        session.save()

        # Serialize messages
        messages = [user_message, assistant_message]
        serializer = ChatMessageSerializer(messages, many=True)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

class SavedSnippetList(APIView):
    def get(self, request):
        query = request.query_params.get('q', '')
        lang = request.query_params.get('lang', '')
        
        snippets = SavedSnippet.objects.all()
        if query:
            snippets = snippets.filter(
                Q(title__icontains=query) | 
                Q(explanation__icontains=query) |
                Q(tags__icontains=query)
            )
        if lang:
            snippets = snippets.filter(language__iexact=lang)
            
        serializer = SavedSnippetSerializer(snippets, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = SavedSnippetSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class SavedSnippetDetail(APIView):
    def get_object(self, pk):
        try:
            return SavedSnippet.objects.get(pk=pk)
        except SavedSnippet.DoesNotExist:
            return None

    def get(self, request, pk):
        snippet = self.get_object(pk)
        if not snippet:
            return Response({"error": "Snippet not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = SavedSnippetSerializer(snippet)
        return Response(serializer.data)

    def put(self, request, pk):
        snippet = self.get_object(pk)
        if not snippet:
            return Response({"error": "Snippet not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = SavedSnippetSerializer(snippet, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        snippet = self.get_object(pk)
        if not snippet:
            return Response({"error": "Snippet not found"}, status=status.HTTP_404_NOT_FOUND)
        snippet.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

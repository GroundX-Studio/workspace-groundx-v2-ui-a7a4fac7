{{- define "groundx-web-ui.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "groundx-web-ui.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "groundx-web-ui.labels" -}}
app.kubernetes.io/name: {{ include "groundx-web-ui.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
groundx.io/environment: {{ .Values.environment | quote }}
{{- end -}}

{{- define "groundx-web-ui.selectorLabels" -}}
app.kubernetes.io/name: {{ include "groundx-web-ui.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

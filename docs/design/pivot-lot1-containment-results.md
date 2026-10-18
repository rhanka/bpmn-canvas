# Lot 1 third-review containment inventory

The descriptor campaign covers 528 concrete child/container cases across 121 child types. Both formatted codecs agree: **20 changed exports, 508 typed refusals, zero unchanged successful exports**. Every success differs from both the C1 golden and its container's pre-injection bytes. C1–C7 fixtures and goldens are unchanged.

Outcomes depend on the containing property and required structure. For example, a Task is exported as a process flow element and refused as an opaque extension value. Bare IO endpoints or sets without valid membership are refused; the separate standard IO regressions exercise valid process/activity IO, endpoint associations and complete multi-set membership. Referenced DataObject/Property declarations and necessary IO scaffolding are consumed with their owning projection; unused declarations are refused.

## Changed exports

| Container property | Child type |
|---|---|
| Collaboration.artifacts | bpmn:Association |
| Process.flowElements | bpmn:ExclusiveGateway |
| Process.flowElements | bpmn:ParallelGateway |
| Process.flowElements | bpmn:IntermediateThrowEvent |
| Process.flowElements | bpmn:EndEvent |
| Process.flowElements | bpmn:StartEvent |
| Process.flowElements | bpmn:DataObjectReference |
| Process.flowElements | bpmn:SequenceFlow |
| Process.flowElements | bpmn:SubProcess |
| Process.flowElements | bpmn:CallActivity |
| Process.flowElements | bpmn:Task |
| Process.artifacts | bpmn:TextAnnotation |
| Process.artifacts | bpmn:Association |
| LaneSet.lanes | bpmn:Lane |
| Task.dataInputAssociations | bpmn:DataInputAssociation |
| Task.dataOutputAssociations | bpmn:DataOutputAssociation |
| SubProcess.dataInputAssociations | bpmn:DataInputAssociation |
| SubProcess.dataOutputAssociations | bpmn:DataOutputAssociation |
| CallActivity.dataInputAssociations | bpmn:DataInputAssociation |
| CallActivity.dataOutputAssociations | bpmn:DataOutputAssociation |

## Refused constructs

All types below have at least one refused injection. The count is by container/property case; types that also export in a supported location appear in the preceding table. Refusals are typed, with an offending element or owner ID (empty when that construct has no BPMN ID).

| Child type | Refused cases | Diagnostic codes |
|---|---:|---|
| bpmn:AdHocSubProcess | 4 | nested-subprocess, unsupported-element |
| bpmn:Assignment | 4 | unsupported-element |
| bpmn:Association | 3 | nested-subprocess, unsupported-element |
| bpmn:Auditing | 14 | unsupported-element |
| bpmn:BoundaryEvent | 4 | nested-subprocess, unsupported-element |
| bpmn:BusinessRuleTask | 4 | nested-subprocess, unsupported-element |
| bpmn:CallActivity | 3 | nested-subprocess, unsupported-element |
| bpmn:CallChoreography | 4 | nested-subprocess, unsupported-element |
| bpmn:CallConversation | 3 | unsupported-element |
| bpmn:CancelEventDefinition | 6 | unsupported-element |
| bpmn:Category | 3 | unsupported-element |
| bpmn:CategoryValue | 2 | unsupported-element |
| bpmn:Choreography | 3 | unsupported-element |
| bpmn:ChoreographyTask | 4 | nested-subprocess, unsupported-element |
| bpmn:Collaboration | 3 | unsupported-element, unsupported-structure |
| bpmn:CompensateEventDefinition | 6 | unsupported-element |
| bpmn:ComplexBehaviorDefinition | 2 | unsupported-element |
| bpmn:ComplexGateway | 4 | nested-subprocess, unsupported-element |
| bpmn:ConditionalEventDefinition | 6 | unsupported-element |
| bpmn:Conversation | 3 | unsupported-element |
| bpmn:ConversationAssociation | 3 | unsupported-element |
| bpmn:ConversationLink | 3 | unsupported-element |
| bpmn:CorrelationKey | 3 | unsupported-element |
| bpmn:CorrelationProperty | 3 | unsupported-element |
| bpmn:CorrelationPropertyBinding | 2 | unsupported-element |
| bpmn:CorrelationPropertyRetrievalExpression | 2 | unsupported-element |
| bpmn:CorrelationSubscription | 3 | unsupported-element |
| bpmn:DataAssociation | 2 | unsupported-element |
| bpmn:DataInput | 5 | invalid-semantics, unsupported-element |
| bpmn:DataInputAssociation | 4 | unsupported-element |
| bpmn:DataObject | 4 | nested-subprocess, unsupported-element |
| bpmn:DataObjectReference | 3 | nested-subprocess, unsupported-element |
| bpmn:DataOutput | 4 | invalid-semantics, unsupported-element |
| bpmn:DataOutputAssociation | 3 | unsupported-element |
| bpmn:DataState | 7 | unsupported-element |
| bpmn:DataStore | 3 | unsupported-element |
| bpmn:DataStoreReference | 4 | nested-subprocess, unsupported-element |
| bpmn:Definitions | 2 | unsupported-element |
| bpmn:Documentation | 29 | unsupported-element |
| bpmn:EndEvent | 3 | nested-subprocess, unsupported-element |
| bpmn:EndPoint | 3 | unsupported-element |
| bpmn:Error | 3 | unsupported-element |
| bpmn:ErrorEventDefinition | 6 | unsupported-element |
| bpmn:Escalation | 3 | unsupported-element |
| bpmn:EscalationEventDefinition | 6 | unsupported-element |
| bpmn:EventBasedGateway | 4 | nested-subprocess, unsupported-element |
| bpmn:ExclusiveGateway | 3 | nested-subprocess, unsupported-element |
| bpmn:Expression | 3 | unsupported-element |
| bpmn:Extension | 2 | unsupported-element |
| bpmn:ExtensionAttributeDefinition | 1 | unsupported-element |
| bpmn:ExtensionDefinition | 1 | unsupported-element |
| bpmn:ExtensionElements | 28 | missing-semantics, unsupported-element |
| bpmn:FormalExpression | 5 | unsupported-element |
| bpmn:GlobalBusinessRuleTask | 3 | unsupported-element |
| bpmn:GlobalChoreographyTask | 3 | unsupported-element |
| bpmn:GlobalConversation | 3 | unsupported-element |
| bpmn:GlobalManualTask | 3 | unsupported-element |
| bpmn:GlobalScriptTask | 3 | unsupported-element |
| bpmn:GlobalTask | 3 | unsupported-element |
| bpmn:GlobalUserTask | 3 | unsupported-element |
| bpmn:Group | 5 | nested-subprocess, unsupported-element |
| bpmn:HumanPerformer | 6 | unsupported-element |
| bpmn:ImplicitThrowEvent | 4 | nested-subprocess, unsupported-element |
| bpmn:Import | 2 | unsupported-element |
| bpmn:InclusiveGateway | 4 | nested-subprocess, unsupported-element |
| bpmn:InputOutputBinding | 2 | unsupported-element |
| bpmn:InputOutputSpecification | 6 | unsupported-element |
| bpmn:InputSet | 5 | unsupported-element |
| bpmn:Interface | 3 | unsupported-element |
| bpmn:IntermediateCatchEvent | 4 | nested-subprocess, unsupported-element |
| bpmn:IntermediateThrowEvent | 3 | nested-subprocess, unsupported-element |
| bpmn:ItemAwareElement | 2 | unsupported-element |
| bpmn:ItemDefinition | 3 | unsupported-element |
| bpmn:Lane | 2 | unsupported-element |
| bpmn:LaneSet | 5 | nested-subprocess, unsupported-element |
| bpmn:LinkEventDefinition | 6 | unsupported-element |
| bpmn:ManualTask | 4 | nested-subprocess, unsupported-element |
| bpmn:Message | 3 | unsupported-element |
| bpmn:MessageEventDefinition | 6 | unsupported-element |
| bpmn:MessageFlow | 3 | unsupported-element |
| bpmn:MessageFlowAssociation | 3 | unsupported-element |
| bpmn:Monitoring | 14 | unsupported-element |
| bpmn:MultiInstanceLoopCharacteristics | 5 | unsupported-element |
| bpmn:Operation | 2 | unsupported-element |
| bpmn:OutputSet | 4 | unsupported-element |
| bpmn:ParallelGateway | 3 | nested-subprocess, unsupported-element |
| bpmn:Participant | 3 | multiple-participants, unsupported-element |
| bpmn:ParticipantAssociation | 3 | unsupported-element |
| bpmn:ParticipantMultiplicity | 3 | unsupported-element |
| bpmn:PartnerEntity | 3 | unsupported-element |
| bpmn:PartnerRole | 3 | unsupported-element |
| bpmn:Performer | 6 | unsupported-element |
| bpmn:PotentialOwner | 6 | unsupported-element |
| bpmn:Process | 3 | missing-di, unsupported-element |
| bpmn:Property | 9 | unsupported-element |
| bpmn:ReceiveTask | 4 | nested-subprocess, unsupported-element |
| bpmn:Relationship | 3 | unsupported-element |
| bpmn:Rendering | 2 | unsupported-element |
| bpmn:Resource | 3 | unsupported-element |
| bpmn:ResourceAssignmentExpression | 2 | unsupported-element |
| bpmn:ResourceParameter | 2 | unsupported-element |
| bpmn:ResourceParameterBinding | 2 | unsupported-element |
| bpmn:ResourceRole | 6 | unsupported-element |
| bpmn:ScriptTask | 4 | nested-subprocess, unsupported-element |
| bpmn:SendTask | 4 | nested-subprocess, unsupported-element |
| bpmn:SequenceFlow | 3 | invalid-semantics, nested-subprocess |
| bpmn:ServiceTask | 4 | nested-subprocess, unsupported-element |
| bpmn:Signal | 3 | unsupported-element |
| bpmn:SignalEventDefinition | 6 | unsupported-element |
| bpmn:StandardLoopCharacteristics | 5 | unsupported-element |
| bpmn:StartEvent | 3 | nested-subprocess, unsupported-element |
| bpmn:SubChoreography | 4 | nested-subprocess, unsupported-element |
| bpmn:SubConversation | 3 | unsupported-element |
| bpmn:SubProcess | 3 | nested-subprocess, unsupported-element |
| bpmn:Task | 3 | nested-subprocess, unsupported-element |
| bpmn:TerminateEventDefinition | 6 | unsupported-element |
| bpmn:TextAnnotation | 4 | invalid-semantics, nested-subprocess, unsupported-element |
| bpmn:TimerEventDefinition | 6 | unsupported-element |
| bpmn:Transaction | 4 | nested-subprocess, unsupported-element |
| bpmn:UserTask | 4 | nested-subprocess, unsupported-element |
| sem:Info | 1 | invalid-semantics |

## Complete case list

| Container property | Child type | Outcome |
|---|---|---|
| Definitions.documentation | bpmn:Documentation | refused:unsupported-element |
| Definitions.extensionElements | bpmn:ExtensionElements | refused:unsupported-element |
| Definitions.imports | bpmn:Import | refused:unsupported-element |
| Definitions.extensions | bpmn:Extension | refused:unsupported-element |
| Definitions.rootElements | bpmn:Interface | refused:unsupported-element |
| Definitions.rootElements | bpmn:EndPoint | refused:unsupported-element |
| Definitions.rootElements | bpmn:GlobalTask | refused:unsupported-element |
| Definitions.rootElements | bpmn:Process | refused:missing-di |
| Definitions.rootElements | bpmn:GlobalManualTask | refused:unsupported-element |
| Definitions.rootElements | bpmn:GlobalUserTask | refused:unsupported-element |
| Definitions.rootElements | bpmn:CancelEventDefinition | refused:unsupported-element |
| Definitions.rootElements | bpmn:ErrorEventDefinition | refused:unsupported-element |
| Definitions.rootElements | bpmn:TerminateEventDefinition | refused:unsupported-element |
| Definitions.rootElements | bpmn:EscalationEventDefinition | refused:unsupported-element |
| Definitions.rootElements | bpmn:Escalation | refused:unsupported-element |
| Definitions.rootElements | bpmn:CompensateEventDefinition | refused:unsupported-element |
| Definitions.rootElements | bpmn:TimerEventDefinition | refused:unsupported-element |
| Definitions.rootElements | bpmn:LinkEventDefinition | refused:unsupported-element |
| Definitions.rootElements | bpmn:MessageEventDefinition | refused:unsupported-element |
| Definitions.rootElements | bpmn:ConditionalEventDefinition | refused:unsupported-element |
| Definitions.rootElements | bpmn:SignalEventDefinition | refused:unsupported-element |
| Definitions.rootElements | bpmn:Signal | refused:unsupported-element |
| Definitions.rootElements | bpmn:DataStore | refused:unsupported-element |
| Definitions.rootElements | bpmn:GlobalConversation | refused:unsupported-element |
| Definitions.rootElements | bpmn:PartnerEntity | refused:unsupported-element |
| Definitions.rootElements | bpmn:PartnerRole | refused:unsupported-element |
| Definitions.rootElements | bpmn:CorrelationProperty | refused:unsupported-element |
| Definitions.rootElements | bpmn:Error | refused:unsupported-element |
| Definitions.rootElements | bpmn:Message | refused:unsupported-element |
| Definitions.rootElements | bpmn:ItemDefinition | refused:unsupported-element |
| Definitions.rootElements | bpmn:Resource | refused:unsupported-element |
| Definitions.rootElements | bpmn:Collaboration | refused:unsupported-structure |
| Definitions.rootElements | bpmn:Choreography | refused:unsupported-element |
| Definitions.rootElements | bpmn:GlobalChoreographyTask | refused:unsupported-element |
| Definitions.rootElements | bpmn:Category | refused:unsupported-element |
| Definitions.rootElements | bpmn:GlobalScriptTask | refused:unsupported-element |
| Definitions.rootElements | bpmn:GlobalBusinessRuleTask | refused:unsupported-element |
| Definitions.relationships | bpmn:Relationship | refused:unsupported-element |
| Collaboration.documentation | bpmn:Documentation | refused:unsupported-element |
| Collaboration.extensionElements | bpmn:ExtensionElements | refused:unsupported-element |
| Collaboration.participants | bpmn:Participant | refused:multiple-participants |
| Collaboration.messageFlows | bpmn:MessageFlow | refused:unsupported-element |
| Collaboration.artifacts | bpmn:TextAnnotation | refused:invalid-semantics |
| Collaboration.artifacts | bpmn:Group | refused:unsupported-element |
| Collaboration.artifacts | bpmn:Association | exported |
| Collaboration.conversations | bpmn:CallConversation | refused:unsupported-element |
| Collaboration.conversations | bpmn:Conversation | refused:unsupported-element |
| Collaboration.conversations | bpmn:SubConversation | refused:unsupported-element |
| Collaboration.conversationAssociations | bpmn:ConversationAssociation | refused:unsupported-element |
| Collaboration.participantAssociations | bpmn:ParticipantAssociation | refused:unsupported-element |
| Collaboration.messageFlowAssociations | bpmn:MessageFlowAssociation | refused:unsupported-element |
| Collaboration.correlationKeys | bpmn:CorrelationKey | refused:unsupported-element |
| Collaboration.conversationLinks | bpmn:ConversationLink | refused:unsupported-element |
| Participant.documentation | bpmn:Documentation | refused:unsupported-element |
| Participant.extensionElements | bpmn:ExtensionElements | refused:unsupported-element |
| Participant.participantMultiplicity | bpmn:ParticipantMultiplicity | refused:unsupported-element |
| Process.documentation | bpmn:Documentation | refused:unsupported-element |
| Process.extensionElements | bpmn:ExtensionElements | refused:unsupported-element |
| Process.ioSpecification | bpmn:InputOutputSpecification | refused:unsupported-element |
| Process.ioBinding | bpmn:InputOutputBinding | refused:unsupported-element |
| Process.auditing | bpmn:Auditing | refused:unsupported-element |
| Process.monitoring | bpmn:Monitoring | refused:unsupported-element |
| Process.properties | bpmn:Property | refused:unsupported-element |
| Process.laneSets | bpmn:LaneSet | refused:unsupported-element |
| Process.flowElements | bpmn:ManualTask | refused:unsupported-element |
| Process.flowElements | bpmn:UserTask | refused:unsupported-element |
| Process.flowElements | bpmn:EventBasedGateway | refused:unsupported-element |
| Process.flowElements | bpmn:ComplexGateway | refused:unsupported-element |
| Process.flowElements | bpmn:ExclusiveGateway | exported |
| Process.flowElements | bpmn:InclusiveGateway | refused:unsupported-element |
| Process.flowElements | bpmn:ParallelGateway | exported |
| Process.flowElements | bpmn:IntermediateCatchEvent | refused:unsupported-element |
| Process.flowElements | bpmn:IntermediateThrowEvent | exported |
| Process.flowElements | bpmn:EndEvent | exported |
| Process.flowElements | bpmn:StartEvent | exported |
| Process.flowElements | bpmn:BoundaryEvent | refused:unsupported-element |
| Process.flowElements | bpmn:ImplicitThrowEvent | refused:unsupported-element |
| Process.flowElements | bpmn:DataObject | refused:unsupported-element |
| Process.flowElements | bpmn:DataStoreReference | refused:unsupported-element |
| Process.flowElements | bpmn:DataObjectReference | exported |
| Process.flowElements | bpmn:SequenceFlow | exported |
| Process.flowElements | bpmn:CallChoreography | refused:unsupported-element |
| Process.flowElements | bpmn:SubChoreography | refused:unsupported-element |
| Process.flowElements | bpmn:ChoreographyTask | refused:unsupported-element |
| Process.flowElements | bpmn:ServiceTask | refused:unsupported-element |
| Process.flowElements | bpmn:SubProcess | exported |
| Process.flowElements | bpmn:CallActivity | exported |
| Process.flowElements | bpmn:Task | exported |
| Process.flowElements | bpmn:SendTask | refused:unsupported-element |
| Process.flowElements | bpmn:ReceiveTask | refused:unsupported-element |
| Process.flowElements | bpmn:ScriptTask | refused:unsupported-element |
| Process.flowElements | bpmn:BusinessRuleTask | refused:unsupported-element |
| Process.flowElements | bpmn:AdHocSubProcess | refused:unsupported-element |
| Process.flowElements | bpmn:Transaction | refused:unsupported-element |
| Process.artifacts | bpmn:TextAnnotation | exported |
| Process.artifacts | bpmn:Group | refused:unsupported-element |
| Process.artifacts | bpmn:Association | exported |
| Process.resources | bpmn:Performer | refused:unsupported-element |
| Process.resources | bpmn:HumanPerformer | refused:unsupported-element |
| Process.resources | bpmn:PotentialOwner | refused:unsupported-element |
| Process.resources | bpmn:ResourceRole | refused:unsupported-element |
| Process.correlationSubscriptions | bpmn:CorrelationSubscription | refused:unsupported-element |
| LaneSet.documentation | bpmn:Documentation | refused:unsupported-element |
| LaneSet.extensionElements | bpmn:ExtensionElements | refused:unsupported-element |
| LaneSet.lanes | bpmn:Lane | exported |
| Lane.documentation | bpmn:Documentation | refused:unsupported-element |
| Lane.extensionElements | bpmn:ExtensionElements | refused:unsupported-element |
| Lane.partitionElement | bpmn:Interface | refused:unsupported-element |
| Lane.partitionElement | bpmn:Operation | refused:unsupported-element |
| Lane.partitionElement | bpmn:EndPoint | refused:unsupported-element |
| Lane.partitionElement | bpmn:Auditing | refused:unsupported-element |
| Lane.partitionElement | bpmn:GlobalTask | refused:unsupported-element |
| Lane.partitionElement | bpmn:Monitoring | refused:unsupported-element |
| Lane.partitionElement | bpmn:Performer | refused:unsupported-element |
| Lane.partitionElement | bpmn:Process | refused:unsupported-element |
| Lane.partitionElement | bpmn:LaneSet | refused:unsupported-element |
| Lane.partitionElement | bpmn:Lane | refused:unsupported-element |
| Lane.partitionElement | bpmn:GlobalManualTask | refused:unsupported-element |
| Lane.partitionElement | bpmn:ManualTask | refused:unsupported-element |
| Lane.partitionElement | bpmn:UserTask | refused:unsupported-element |
| Lane.partitionElement | bpmn:Rendering | refused:unsupported-element |
| Lane.partitionElement | bpmn:HumanPerformer | refused:unsupported-element |
| Lane.partitionElement | bpmn:PotentialOwner | refused:unsupported-element |
| Lane.partitionElement | bpmn:GlobalUserTask | refused:unsupported-element |
| Lane.partitionElement | bpmn:EventBasedGateway | refused:unsupported-element |
| Lane.partitionElement | bpmn:ComplexGateway | refused:unsupported-element |
| Lane.partitionElement | bpmn:ExclusiveGateway | refused:unsupported-element |
| Lane.partitionElement | bpmn:InclusiveGateway | refused:unsupported-element |
| Lane.partitionElement | bpmn:ParallelGateway | refused:unsupported-element |
| Lane.partitionElement | bpmn:Relationship | refused:unsupported-element |
| Lane.partitionElement | bpmn:Documentation | refused:unsupported-element |
| Lane.partitionElement | bpmn:IntermediateCatchEvent | refused:unsupported-element |
| Lane.partitionElement | bpmn:IntermediateThrowEvent | refused:unsupported-element |
| Lane.partitionElement | bpmn:EndEvent | refused:unsupported-element |
| Lane.partitionElement | bpmn:StartEvent | refused:unsupported-element |
| Lane.partitionElement | bpmn:BoundaryEvent | refused:unsupported-element |
| Lane.partitionElement | bpmn:CancelEventDefinition | refused:unsupported-element |
| Lane.partitionElement | bpmn:ErrorEventDefinition | refused:unsupported-element |
| Lane.partitionElement | bpmn:TerminateEventDefinition | refused:unsupported-element |
| Lane.partitionElement | bpmn:EscalationEventDefinition | refused:unsupported-element |
| Lane.partitionElement | bpmn:Escalation | refused:unsupported-element |
| Lane.partitionElement | bpmn:CompensateEventDefinition | refused:unsupported-element |
| Lane.partitionElement | bpmn:TimerEventDefinition | refused:unsupported-element |
| Lane.partitionElement | bpmn:LinkEventDefinition | refused:unsupported-element |
| Lane.partitionElement | bpmn:MessageEventDefinition | refused:unsupported-element |
| Lane.partitionElement | bpmn:ConditionalEventDefinition | refused:unsupported-element |
| Lane.partitionElement | bpmn:SignalEventDefinition | refused:unsupported-element |
| Lane.partitionElement | bpmn:Signal | refused:unsupported-element |
| Lane.partitionElement | bpmn:ImplicitThrowEvent | refused:unsupported-element |
| Lane.partitionElement | bpmn:DataState | refused:unsupported-element |
| Lane.partitionElement | bpmn:ItemAwareElement | refused:unsupported-element |
| Lane.partitionElement | bpmn:DataAssociation | refused:unsupported-element |
| Lane.partitionElement | bpmn:DataInput | refused:unsupported-element |
| Lane.partitionElement | bpmn:DataOutput | refused:unsupported-element |
| Lane.partitionElement | bpmn:InputSet | refused:unsupported-element |
| Lane.partitionElement | bpmn:OutputSet | refused:unsupported-element |
| Lane.partitionElement | bpmn:Property | refused:unsupported-element |
| Lane.partitionElement | bpmn:DataInputAssociation | refused:unsupported-element |
| Lane.partitionElement | bpmn:DataOutputAssociation | refused:unsupported-element |
| Lane.partitionElement | bpmn:InputOutputSpecification | refused:unsupported-element |
| Lane.partitionElement | bpmn:DataObject | refused:unsupported-element |
| Lane.partitionElement | bpmn:Assignment | refused:unsupported-element |
| Lane.partitionElement | bpmn:DataStore | refused:unsupported-element |
| Lane.partitionElement | bpmn:DataStoreReference | refused:unsupported-element |
| Lane.partitionElement | bpmn:DataObjectReference | refused:unsupported-element |
| Lane.partitionElement | bpmn:ConversationLink | refused:unsupported-element |
| Lane.partitionElement | bpmn:ConversationAssociation | refused:unsupported-element |
| Lane.partitionElement | bpmn:CallConversation | refused:unsupported-element |
| Lane.partitionElement | bpmn:Conversation | refused:unsupported-element |
| Lane.partitionElement | bpmn:SubConversation | refused:unsupported-element |
| Lane.partitionElement | bpmn:GlobalConversation | refused:unsupported-element |
| Lane.partitionElement | bpmn:PartnerEntity | refused:unsupported-element |
| Lane.partitionElement | bpmn:PartnerRole | refused:unsupported-element |
| Lane.partitionElement | bpmn:CorrelationProperty | refused:unsupported-element |
| Lane.partitionElement | bpmn:Error | refused:unsupported-element |
| Lane.partitionElement | bpmn:CorrelationKey | refused:unsupported-element |
| Lane.partitionElement | bpmn:Expression | refused:unsupported-element |
| Lane.partitionElement | bpmn:FormalExpression | refused:unsupported-element |
| Lane.partitionElement | bpmn:Message | refused:unsupported-element |
| Lane.partitionElement | bpmn:ItemDefinition | refused:unsupported-element |
| Lane.partitionElement | bpmn:SequenceFlow | refused:invalid-semantics |
| Lane.partitionElement | bpmn:CorrelationPropertyRetrievalExpression | refused:unsupported-element |
| Lane.partitionElement | bpmn:CorrelationPropertyBinding | refused:unsupported-element |
| Lane.partitionElement | bpmn:Resource | refused:unsupported-element |
| Lane.partitionElement | bpmn:ResourceParameter | refused:unsupported-element |
| Lane.partitionElement | bpmn:CorrelationSubscription | refused:unsupported-element |
| Lane.partitionElement | bpmn:MessageFlow | refused:unsupported-element |
| Lane.partitionElement | bpmn:MessageFlowAssociation | refused:unsupported-element |
| Lane.partitionElement | bpmn:Participant | refused:unsupported-element |
| Lane.partitionElement | bpmn:ParticipantAssociation | refused:unsupported-element |
| Lane.partitionElement | bpmn:ParticipantMultiplicity | refused:unsupported-element |
| Lane.partitionElement | bpmn:Collaboration | refused:unsupported-element |
| Lane.partitionElement | bpmn:CallChoreography | refused:unsupported-element |
| Lane.partitionElement | bpmn:SubChoreography | refused:unsupported-element |
| Lane.partitionElement | bpmn:ChoreographyTask | refused:unsupported-element |
| Lane.partitionElement | bpmn:Choreography | refused:unsupported-element |
| Lane.partitionElement | bpmn:GlobalChoreographyTask | refused:unsupported-element |
| Lane.partitionElement | bpmn:TextAnnotation | refused:unsupported-element |
| Lane.partitionElement | bpmn:Group | refused:unsupported-element |
| Lane.partitionElement | bpmn:Association | refused:unsupported-element |
| Lane.partitionElement | bpmn:Category | refused:unsupported-element |
| Lane.partitionElement | bpmn:CategoryValue | refused:unsupported-element |
| Lane.partitionElement | bpmn:ServiceTask | refused:unsupported-element |
| Lane.partitionElement | bpmn:SubProcess | refused:unsupported-element |
| Lane.partitionElement | bpmn:MultiInstanceLoopCharacteristics | refused:unsupported-element |
| Lane.partitionElement | bpmn:StandardLoopCharacteristics | refused:unsupported-element |
| Lane.partitionElement | bpmn:CallActivity | refused:unsupported-element |
| Lane.partitionElement | bpmn:Task | refused:unsupported-element |
| Lane.partitionElement | bpmn:SendTask | refused:unsupported-element |
| Lane.partitionElement | bpmn:ReceiveTask | refused:unsupported-element |
| Lane.partitionElement | bpmn:ScriptTask | refused:unsupported-element |
| Lane.partitionElement | bpmn:BusinessRuleTask | refused:unsupported-element |
| Lane.partitionElement | bpmn:AdHocSubProcess | refused:unsupported-element |
| Lane.partitionElement | bpmn:Transaction | refused:unsupported-element |
| Lane.partitionElement | bpmn:GlobalScriptTask | refused:unsupported-element |
| Lane.partitionElement | bpmn:GlobalBusinessRuleTask | refused:unsupported-element |
| Lane.partitionElement | bpmn:ComplexBehaviorDefinition | refused:unsupported-element |
| Lane.partitionElement | bpmn:ResourceRole | refused:unsupported-element |
| Lane.partitionElement | bpmn:ResourceParameterBinding | refused:unsupported-element |
| Lane.partitionElement | bpmn:ResourceAssignmentExpression | refused:unsupported-element |
| Lane.partitionElement | bpmn:Definitions | refused:unsupported-element |
| Lane.childLaneSet | bpmn:LaneSet | refused:unsupported-element |
| Task.documentation | bpmn:Documentation | refused:unsupported-element |
| Task.extensionElements | bpmn:ExtensionElements | refused:unsupported-element |
| Task.auditing | bpmn:Auditing | refused:unsupported-element |
| Task.monitoring | bpmn:Monitoring | refused:unsupported-element |
| Task.ioSpecification | bpmn:InputOutputSpecification | refused:unsupported-element |
| Task.properties | bpmn:Property | refused:unsupported-element |
| Task.dataInputAssociations | bpmn:DataInputAssociation | exported |
| Task.dataOutputAssociations | bpmn:DataOutputAssociation | exported |
| Task.resources | bpmn:Performer | refused:unsupported-element |
| Task.resources | bpmn:HumanPerformer | refused:unsupported-element |
| Task.resources | bpmn:PotentialOwner | refused:unsupported-element |
| Task.resources | bpmn:ResourceRole | refused:unsupported-element |
| Task.loopCharacteristics | bpmn:MultiInstanceLoopCharacteristics | refused:unsupported-element |
| Task.loopCharacteristics | bpmn:StandardLoopCharacteristics | refused:unsupported-element |
| SubProcess.documentation | bpmn:Documentation | refused:unsupported-element |
| SubProcess.extensionElements | bpmn:ExtensionElements | refused:unsupported-element |
| SubProcess.auditing | bpmn:Auditing | refused:unsupported-element |
| SubProcess.monitoring | bpmn:Monitoring | refused:unsupported-element |
| SubProcess.ioSpecification | bpmn:InputOutputSpecification | refused:unsupported-element |
| SubProcess.properties | bpmn:Property | refused:unsupported-element |
| SubProcess.dataInputAssociations | bpmn:DataInputAssociation | exported |
| SubProcess.dataOutputAssociations | bpmn:DataOutputAssociation | exported |
| SubProcess.resources | bpmn:Performer | refused:unsupported-element |
| SubProcess.resources | bpmn:HumanPerformer | refused:unsupported-element |
| SubProcess.resources | bpmn:PotentialOwner | refused:unsupported-element |
| SubProcess.resources | bpmn:ResourceRole | refused:unsupported-element |
| SubProcess.loopCharacteristics | bpmn:MultiInstanceLoopCharacteristics | refused:unsupported-element |
| SubProcess.loopCharacteristics | bpmn:StandardLoopCharacteristics | refused:unsupported-element |
| SubProcess.laneSets | bpmn:LaneSet | refused:nested-subprocess |
| SubProcess.flowElements | bpmn:ManualTask | refused:nested-subprocess |
| SubProcess.flowElements | bpmn:UserTask | refused:nested-subprocess |
| SubProcess.flowElements | bpmn:EventBasedGateway | refused:nested-subprocess |
| SubProcess.flowElements | bpmn:ComplexGateway | refused:nested-subprocess |
| SubProcess.flowElements | bpmn:ExclusiveGateway | refused:nested-subprocess |
| SubProcess.flowElements | bpmn:InclusiveGateway | refused:nested-subprocess |
| SubProcess.flowElements | bpmn:ParallelGateway | refused:nested-subprocess |
| SubProcess.flowElements | bpmn:IntermediateCatchEvent | refused:nested-subprocess |
| SubProcess.flowElements | bpmn:IntermediateThrowEvent | refused:nested-subprocess |
| SubProcess.flowElements | bpmn:EndEvent | refused:nested-subprocess |
| SubProcess.flowElements | bpmn:StartEvent | refused:nested-subprocess |
| SubProcess.flowElements | bpmn:BoundaryEvent | refused:nested-subprocess |
| SubProcess.flowElements | bpmn:ImplicitThrowEvent | refused:nested-subprocess |
| SubProcess.flowElements | bpmn:DataObject | refused:nested-subprocess |
| SubProcess.flowElements | bpmn:DataStoreReference | refused:nested-subprocess |
| SubProcess.flowElements | bpmn:DataObjectReference | refused:nested-subprocess |
| SubProcess.flowElements | bpmn:SequenceFlow | refused:nested-subprocess |
| SubProcess.flowElements | bpmn:CallChoreography | refused:nested-subprocess |
| SubProcess.flowElements | bpmn:SubChoreography | refused:nested-subprocess |
| SubProcess.flowElements | bpmn:ChoreographyTask | refused:nested-subprocess |
| SubProcess.flowElements | bpmn:ServiceTask | refused:nested-subprocess |
| SubProcess.flowElements | bpmn:SubProcess | refused:nested-subprocess |
| SubProcess.flowElements | bpmn:CallActivity | refused:nested-subprocess |
| SubProcess.flowElements | bpmn:Task | refused:nested-subprocess |
| SubProcess.flowElements | bpmn:SendTask | refused:nested-subprocess |
| SubProcess.flowElements | bpmn:ReceiveTask | refused:nested-subprocess |
| SubProcess.flowElements | bpmn:ScriptTask | refused:nested-subprocess |
| SubProcess.flowElements | bpmn:BusinessRuleTask | refused:nested-subprocess |
| SubProcess.flowElements | bpmn:AdHocSubProcess | refused:nested-subprocess |
| SubProcess.flowElements | bpmn:Transaction | refused:nested-subprocess |
| SubProcess.artifacts | bpmn:TextAnnotation | refused:nested-subprocess |
| SubProcess.artifacts | bpmn:Group | refused:nested-subprocess |
| SubProcess.artifacts | bpmn:Association | refused:nested-subprocess |
| CallActivity.documentation | bpmn:Documentation | refused:unsupported-element |
| CallActivity.extensionElements | bpmn:ExtensionElements | refused:unsupported-element |
| CallActivity.auditing | bpmn:Auditing | refused:unsupported-element |
| CallActivity.monitoring | bpmn:Monitoring | refused:unsupported-element |
| CallActivity.ioSpecification | bpmn:InputOutputSpecification | refused:unsupported-element |
| CallActivity.properties | bpmn:Property | refused:unsupported-element |
| CallActivity.dataInputAssociations | bpmn:DataInputAssociation | exported |
| CallActivity.dataOutputAssociations | bpmn:DataOutputAssociation | exported |
| CallActivity.resources | bpmn:Performer | refused:unsupported-element |
| CallActivity.resources | bpmn:HumanPerformer | refused:unsupported-element |
| CallActivity.resources | bpmn:PotentialOwner | refused:unsupported-element |
| CallActivity.resources | bpmn:ResourceRole | refused:unsupported-element |
| CallActivity.loopCharacteristics | bpmn:MultiInstanceLoopCharacteristics | refused:unsupported-element |
| CallActivity.loopCharacteristics | bpmn:StandardLoopCharacteristics | refused:unsupported-element |
| StartEvent.documentation | bpmn:Documentation | refused:unsupported-element |
| StartEvent.extensionElements | bpmn:ExtensionElements | refused:unsupported-element |
| StartEvent.auditing | bpmn:Auditing | refused:unsupported-element |
| StartEvent.monitoring | bpmn:Monitoring | refused:unsupported-element |
| StartEvent.properties | bpmn:Property | refused:unsupported-element |
| StartEvent.dataOutputs | bpmn:DataOutput | refused:unsupported-element |
| StartEvent.dataOutputAssociations | bpmn:DataOutputAssociation | refused:unsupported-element |
| StartEvent.outputSet | bpmn:OutputSet | refused:unsupported-element |
| StartEvent.eventDefinitions | bpmn:CancelEventDefinition | refused:unsupported-element |
| StartEvent.eventDefinitions | bpmn:ErrorEventDefinition | refused:unsupported-element |
| StartEvent.eventDefinitions | bpmn:TerminateEventDefinition | refused:unsupported-element |
| StartEvent.eventDefinitions | bpmn:EscalationEventDefinition | refused:unsupported-element |
| StartEvent.eventDefinitions | bpmn:CompensateEventDefinition | refused:unsupported-element |
| StartEvent.eventDefinitions | bpmn:TimerEventDefinition | refused:unsupported-element |
| StartEvent.eventDefinitions | bpmn:LinkEventDefinition | refused:unsupported-element |
| StartEvent.eventDefinitions | bpmn:MessageEventDefinition | refused:unsupported-element |
| StartEvent.eventDefinitions | bpmn:ConditionalEventDefinition | refused:unsupported-element |
| StartEvent.eventDefinitions | bpmn:SignalEventDefinition | refused:unsupported-element |
| EndEvent.documentation | bpmn:Documentation | refused:unsupported-element |
| EndEvent.extensionElements | bpmn:ExtensionElements | refused:unsupported-element |
| EndEvent.auditing | bpmn:Auditing | refused:unsupported-element |
| EndEvent.monitoring | bpmn:Monitoring | refused:unsupported-element |
| EndEvent.properties | bpmn:Property | refused:unsupported-element |
| EndEvent.dataInputs | bpmn:DataInput | refused:unsupported-element |
| EndEvent.dataInputAssociations | bpmn:DataInputAssociation | refused:unsupported-element |
| EndEvent.inputSet | bpmn:InputSet | refused:unsupported-element |
| EndEvent.eventDefinitions | bpmn:CancelEventDefinition | refused:unsupported-element |
| EndEvent.eventDefinitions | bpmn:ErrorEventDefinition | refused:unsupported-element |
| EndEvent.eventDefinitions | bpmn:TerminateEventDefinition | refused:unsupported-element |
| EndEvent.eventDefinitions | bpmn:EscalationEventDefinition | refused:unsupported-element |
| EndEvent.eventDefinitions | bpmn:CompensateEventDefinition | refused:unsupported-element |
| EndEvent.eventDefinitions | bpmn:TimerEventDefinition | refused:unsupported-element |
| EndEvent.eventDefinitions | bpmn:LinkEventDefinition | refused:unsupported-element |
| EndEvent.eventDefinitions | bpmn:MessageEventDefinition | refused:unsupported-element |
| EndEvent.eventDefinitions | bpmn:ConditionalEventDefinition | refused:unsupported-element |
| EndEvent.eventDefinitions | bpmn:SignalEventDefinition | refused:unsupported-element |
| IntermediateThrowEvent.documentation | bpmn:Documentation | refused:unsupported-element |
| IntermediateThrowEvent.extensionElements | bpmn:ExtensionElements | refused:unsupported-element |
| IntermediateThrowEvent.auditing | bpmn:Auditing | refused:unsupported-element |
| IntermediateThrowEvent.monitoring | bpmn:Monitoring | refused:unsupported-element |
| IntermediateThrowEvent.properties | bpmn:Property | refused:unsupported-element |
| IntermediateThrowEvent.dataInputs | bpmn:DataInput | refused:unsupported-element |
| IntermediateThrowEvent.dataInputAssociations | bpmn:DataInputAssociation | refused:unsupported-element |
| IntermediateThrowEvent.inputSet | bpmn:InputSet | refused:unsupported-element |
| IntermediateThrowEvent.eventDefinitions | bpmn:CancelEventDefinition | refused:unsupported-element |
| IntermediateThrowEvent.eventDefinitions | bpmn:ErrorEventDefinition | refused:unsupported-element |
| IntermediateThrowEvent.eventDefinitions | bpmn:TerminateEventDefinition | refused:unsupported-element |
| IntermediateThrowEvent.eventDefinitions | bpmn:EscalationEventDefinition | refused:unsupported-element |
| IntermediateThrowEvent.eventDefinitions | bpmn:CompensateEventDefinition | refused:unsupported-element |
| IntermediateThrowEvent.eventDefinitions | bpmn:TimerEventDefinition | refused:unsupported-element |
| IntermediateThrowEvent.eventDefinitions | bpmn:LinkEventDefinition | refused:unsupported-element |
| IntermediateThrowEvent.eventDefinitions | bpmn:MessageEventDefinition | refused:unsupported-element |
| IntermediateThrowEvent.eventDefinitions | bpmn:ConditionalEventDefinition | refused:unsupported-element |
| IntermediateThrowEvent.eventDefinitions | bpmn:SignalEventDefinition | refused:unsupported-element |
| ExclusiveGateway.documentation | bpmn:Documentation | refused:unsupported-element |
| ExclusiveGateway.extensionElements | bpmn:ExtensionElements | refused:unsupported-element |
| ExclusiveGateway.auditing | bpmn:Auditing | refused:unsupported-element |
| ExclusiveGateway.monitoring | bpmn:Monitoring | refused:unsupported-element |
| ParallelGateway.documentation | bpmn:Documentation | refused:unsupported-element |
| ParallelGateway.extensionElements | bpmn:ExtensionElements | refused:unsupported-element |
| ParallelGateway.auditing | bpmn:Auditing | refused:unsupported-element |
| ParallelGateway.monitoring | bpmn:Monitoring | refused:unsupported-element |
| DataObject.documentation | bpmn:Documentation | refused:unsupported-element |
| DataObject.extensionElements | bpmn:ExtensionElements | refused:unsupported-element |
| DataObject.auditing | bpmn:Auditing | refused:unsupported-element |
| DataObject.monitoring | bpmn:Monitoring | refused:unsupported-element |
| DataObject.dataState | bpmn:DataState | refused:unsupported-element |
| DataObjectReference.documentation | bpmn:Documentation | refused:unsupported-element |
| DataObjectReference.extensionElements | bpmn:ExtensionElements | refused:missing-semantics |
| DataObjectReference.dataState | bpmn:DataState | refused:unsupported-element |
| DataObjectReference.auditing | bpmn:Auditing | refused:unsupported-element |
| DataObjectReference.monitoring | bpmn:Monitoring | refused:unsupported-element |
| TextAnnotation.documentation | bpmn:Documentation | refused:unsupported-element |
| TextAnnotation.extensionElements | bpmn:ExtensionElements | refused:missing-semantics |
| SequenceFlow.documentation | bpmn:Documentation | refused:unsupported-element |
| SequenceFlow.extensionElements | bpmn:ExtensionElements | refused:unsupported-element |
| SequenceFlow.auditing | bpmn:Auditing | refused:unsupported-element |
| SequenceFlow.monitoring | bpmn:Monitoring | refused:unsupported-element |
| SequenceFlow.conditionExpression | bpmn:Expression | refused:unsupported-element |
| SequenceFlow.conditionExpression | bpmn:FormalExpression | refused:unsupported-element |
| Association.documentation | bpmn:Documentation | refused:unsupported-element |
| Association.extensionElements | bpmn:ExtensionElements | refused:unsupported-element |
| DataInputAssociation.documentation | bpmn:Documentation | refused:unsupported-element |
| DataInputAssociation.extensionElements | bpmn:ExtensionElements | refused:unsupported-element |
| DataInputAssociation.transformation | bpmn:FormalExpression | refused:unsupported-element |
| DataInputAssociation.assignment | bpmn:Assignment | refused:unsupported-element |
| DataOutputAssociation.documentation | bpmn:Documentation | refused:unsupported-element |
| DataOutputAssociation.extensionElements | bpmn:ExtensionElements | refused:unsupported-element |
| DataOutputAssociation.transformation | bpmn:FormalExpression | refused:unsupported-element |
| DataOutputAssociation.assignment | bpmn:Assignment | refused:unsupported-element |
| Property.documentation | bpmn:Documentation | refused:unsupported-element |
| Property.extensionElements | bpmn:ExtensionElements | refused:unsupported-element |
| Property.dataState | bpmn:DataState | refused:unsupported-element |
| InputOutputSpecification.documentation | bpmn:Documentation | refused:unsupported-element |
| InputOutputSpecification.extensionElements | bpmn:ExtensionElements | refused:unsupported-element |
| InputOutputSpecification.dataInputs | bpmn:DataInput | refused:invalid-semantics |
| InputOutputSpecification.dataOutputs | bpmn:DataOutput | refused:invalid-semantics |
| InputOutputSpecification.inputSets | bpmn:InputSet | refused:unsupported-element |
| InputOutputSpecification.outputSets | bpmn:OutputSet | refused:unsupported-element |
| InputSet.documentation | bpmn:Documentation | refused:unsupported-element |
| InputSet.extensionElements | bpmn:ExtensionElements | refused:unsupported-element |
| OutputSet.documentation | bpmn:Documentation | refused:unsupported-element |
| OutputSet.extensionElements | bpmn:ExtensionElements | refused:unsupported-element |
| DataInput.documentation | bpmn:Documentation | refused:unsupported-element |
| DataInput.extensionElements | bpmn:ExtensionElements | refused:unsupported-element |
| DataInput.dataState | bpmn:DataState | refused:unsupported-element |
| DataOutput.documentation | bpmn:Documentation | refused:unsupported-element |
| DataOutput.extensionElements | bpmn:ExtensionElements | refused:unsupported-element |
| DataOutput.dataState | bpmn:DataState | refused:unsupported-element |
| ExtensionElements.values | bpmn:Interface | refused:unsupported-element |
| ExtensionElements.values | bpmn:Operation | refused:unsupported-element |
| ExtensionElements.values | bpmn:EndPoint | refused:unsupported-element |
| ExtensionElements.values | bpmn:Auditing | refused:unsupported-element |
| ExtensionElements.values | bpmn:GlobalTask | refused:unsupported-element |
| ExtensionElements.values | bpmn:Monitoring | refused:unsupported-element |
| ExtensionElements.values | bpmn:Performer | refused:unsupported-element |
| ExtensionElements.values | bpmn:Process | refused:unsupported-element |
| ExtensionElements.values | bpmn:LaneSet | refused:unsupported-element |
| ExtensionElements.values | bpmn:Lane | refused:unsupported-element |
| ExtensionElements.values | bpmn:GlobalManualTask | refused:unsupported-element |
| ExtensionElements.values | bpmn:ManualTask | refused:unsupported-element |
| ExtensionElements.values | bpmn:UserTask | refused:unsupported-element |
| ExtensionElements.values | bpmn:Rendering | refused:unsupported-element |
| ExtensionElements.values | bpmn:HumanPerformer | refused:unsupported-element |
| ExtensionElements.values | bpmn:PotentialOwner | refused:unsupported-element |
| ExtensionElements.values | bpmn:GlobalUserTask | refused:unsupported-element |
| ExtensionElements.values | bpmn:EventBasedGateway | refused:unsupported-element |
| ExtensionElements.values | bpmn:ComplexGateway | refused:unsupported-element |
| ExtensionElements.values | bpmn:ExclusiveGateway | refused:unsupported-element |
| ExtensionElements.values | bpmn:InclusiveGateway | refused:unsupported-element |
| ExtensionElements.values | bpmn:ParallelGateway | refused:unsupported-element |
| ExtensionElements.values | bpmn:Relationship | refused:unsupported-element |
| ExtensionElements.values | bpmn:Extension | refused:unsupported-element |
| ExtensionElements.values | bpmn:ExtensionDefinition | refused:unsupported-element |
| ExtensionElements.values | bpmn:ExtensionAttributeDefinition | refused:unsupported-element |
| ExtensionElements.values | bpmn:ExtensionElements | refused:unsupported-element |
| ExtensionElements.values | bpmn:Documentation | refused:unsupported-element |
| ExtensionElements.values | bpmn:IntermediateCatchEvent | refused:unsupported-element |
| ExtensionElements.values | bpmn:IntermediateThrowEvent | refused:unsupported-element |
| ExtensionElements.values | bpmn:EndEvent | refused:unsupported-element |
| ExtensionElements.values | bpmn:StartEvent | refused:unsupported-element |
| ExtensionElements.values | bpmn:BoundaryEvent | refused:unsupported-element |
| ExtensionElements.values | bpmn:CancelEventDefinition | refused:unsupported-element |
| ExtensionElements.values | bpmn:ErrorEventDefinition | refused:unsupported-element |
| ExtensionElements.values | bpmn:TerminateEventDefinition | refused:unsupported-element |
| ExtensionElements.values | bpmn:EscalationEventDefinition | refused:unsupported-element |
| ExtensionElements.values | bpmn:Escalation | refused:unsupported-element |
| ExtensionElements.values | bpmn:CompensateEventDefinition | refused:unsupported-element |
| ExtensionElements.values | bpmn:TimerEventDefinition | refused:unsupported-element |
| ExtensionElements.values | bpmn:LinkEventDefinition | refused:unsupported-element |
| ExtensionElements.values | bpmn:MessageEventDefinition | refused:unsupported-element |
| ExtensionElements.values | bpmn:ConditionalEventDefinition | refused:unsupported-element |
| ExtensionElements.values | bpmn:SignalEventDefinition | refused:unsupported-element |
| ExtensionElements.values | bpmn:Signal | refused:unsupported-element |
| ExtensionElements.values | bpmn:ImplicitThrowEvent | refused:unsupported-element |
| ExtensionElements.values | bpmn:DataState | refused:unsupported-element |
| ExtensionElements.values | bpmn:ItemAwareElement | refused:unsupported-element |
| ExtensionElements.values | bpmn:DataAssociation | refused:unsupported-element |
| ExtensionElements.values | bpmn:DataInput | refused:unsupported-element |
| ExtensionElements.values | bpmn:DataOutput | refused:unsupported-element |
| ExtensionElements.values | bpmn:InputSet | refused:unsupported-element |
| ExtensionElements.values | bpmn:OutputSet | refused:unsupported-element |
| ExtensionElements.values | bpmn:Property | refused:unsupported-element |
| ExtensionElements.values | bpmn:DataInputAssociation | refused:unsupported-element |
| ExtensionElements.values | bpmn:DataOutputAssociation | refused:unsupported-element |
| ExtensionElements.values | bpmn:InputOutputSpecification | refused:unsupported-element |
| ExtensionElements.values | bpmn:DataObject | refused:unsupported-element |
| ExtensionElements.values | bpmn:InputOutputBinding | refused:unsupported-element |
| ExtensionElements.values | bpmn:Assignment | refused:unsupported-element |
| ExtensionElements.values | bpmn:DataStore | refused:unsupported-element |
| ExtensionElements.values | bpmn:DataStoreReference | refused:unsupported-element |
| ExtensionElements.values | bpmn:DataObjectReference | refused:unsupported-element |
| ExtensionElements.values | bpmn:ConversationLink | refused:unsupported-element |
| ExtensionElements.values | bpmn:ConversationAssociation | refused:unsupported-element |
| ExtensionElements.values | bpmn:CallConversation | refused:unsupported-element |
| ExtensionElements.values | bpmn:Conversation | refused:unsupported-element |
| ExtensionElements.values | bpmn:SubConversation | refused:unsupported-element |
| ExtensionElements.values | bpmn:GlobalConversation | refused:unsupported-element |
| ExtensionElements.values | bpmn:PartnerEntity | refused:unsupported-element |
| ExtensionElements.values | bpmn:PartnerRole | refused:unsupported-element |
| ExtensionElements.values | bpmn:CorrelationProperty | refused:unsupported-element |
| ExtensionElements.values | bpmn:Error | refused:unsupported-element |
| ExtensionElements.values | bpmn:CorrelationKey | refused:unsupported-element |
| ExtensionElements.values | bpmn:Expression | refused:unsupported-element |
| ExtensionElements.values | bpmn:FormalExpression | refused:unsupported-element |
| ExtensionElements.values | bpmn:Message | refused:unsupported-element |
| ExtensionElements.values | bpmn:ItemDefinition | refused:unsupported-element |
| ExtensionElements.values | bpmn:SequenceFlow | refused:invalid-semantics |
| ExtensionElements.values | bpmn:CorrelationPropertyRetrievalExpression | refused:unsupported-element |
| ExtensionElements.values | bpmn:CorrelationPropertyBinding | refused:unsupported-element |
| ExtensionElements.values | bpmn:Resource | refused:unsupported-element |
| ExtensionElements.values | bpmn:ResourceParameter | refused:unsupported-element |
| ExtensionElements.values | bpmn:CorrelationSubscription | refused:unsupported-element |
| ExtensionElements.values | bpmn:MessageFlow | refused:unsupported-element |
| ExtensionElements.values | bpmn:MessageFlowAssociation | refused:unsupported-element |
| ExtensionElements.values | bpmn:Participant | refused:unsupported-element |
| ExtensionElements.values | bpmn:ParticipantAssociation | refused:unsupported-element |
| ExtensionElements.values | bpmn:ParticipantMultiplicity | refused:unsupported-element |
| ExtensionElements.values | bpmn:Collaboration | refused:unsupported-element |
| ExtensionElements.values | bpmn:CallChoreography | refused:unsupported-element |
| ExtensionElements.values | bpmn:SubChoreography | refused:unsupported-element |
| ExtensionElements.values | bpmn:ChoreographyTask | refused:unsupported-element |
| ExtensionElements.values | bpmn:Choreography | refused:unsupported-element |
| ExtensionElements.values | bpmn:GlobalChoreographyTask | refused:unsupported-element |
| ExtensionElements.values | bpmn:TextAnnotation | refused:unsupported-element |
| ExtensionElements.values | bpmn:Group | refused:unsupported-element |
| ExtensionElements.values | bpmn:Association | refused:unsupported-element |
| ExtensionElements.values | bpmn:Category | refused:unsupported-element |
| ExtensionElements.values | bpmn:CategoryValue | refused:unsupported-element |
| ExtensionElements.values | bpmn:ServiceTask | refused:unsupported-element |
| ExtensionElements.values | bpmn:SubProcess | refused:unsupported-element |
| ExtensionElements.values | bpmn:MultiInstanceLoopCharacteristics | refused:unsupported-element |
| ExtensionElements.values | bpmn:StandardLoopCharacteristics | refused:unsupported-element |
| ExtensionElements.values | bpmn:CallActivity | refused:unsupported-element |
| ExtensionElements.values | bpmn:Task | refused:unsupported-element |
| ExtensionElements.values | bpmn:SendTask | refused:unsupported-element |
| ExtensionElements.values | bpmn:ReceiveTask | refused:unsupported-element |
| ExtensionElements.values | bpmn:ScriptTask | refused:unsupported-element |
| ExtensionElements.values | bpmn:BusinessRuleTask | refused:unsupported-element |
| ExtensionElements.values | bpmn:AdHocSubProcess | refused:unsupported-element |
| ExtensionElements.values | bpmn:Transaction | refused:unsupported-element |
| ExtensionElements.values | bpmn:GlobalScriptTask | refused:unsupported-element |
| ExtensionElements.values | bpmn:GlobalBusinessRuleTask | refused:unsupported-element |
| ExtensionElements.values | bpmn:ComplexBehaviorDefinition | refused:unsupported-element |
| ExtensionElements.values | bpmn:ResourceRole | refused:unsupported-element |
| ExtensionElements.values | bpmn:ResourceParameterBinding | refused:unsupported-element |
| ExtensionElements.values | bpmn:ResourceAssignmentExpression | refused:unsupported-element |
| ExtensionElements.values | bpmn:Import | refused:unsupported-element |
| ExtensionElements.values | bpmn:Definitions | refused:unsupported-element |
| ExtensionElements.values | sem:Info | refused:invalid-semantics |
